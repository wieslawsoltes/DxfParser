import { normalizeRibbon, findControl, traverseControls } from './core.js';
import { styles } from './styles.js';
import { createIcon } from './icons.js';

const HTMLElementBase = globalThis.HTMLElement || class {};
const list = (value) => (value ? Array.from(value.Items || value) : []);
const safePath = (path) => {
  const parts = String(path).split('.');
  if (parts.some((k) => ['__proto__', 'prototype', 'constructor'].includes(k)))
    throw new TypeError('Unsafe binding path');
  return parts;
};
const read = (source, path) =>
  source?.get ? source.get(path) : safePath(path).reduce((v, k) => v?.[k], source);
const write = (source, path, value) => {
  if (source?.set) return source.set(path, value);
  const keys = safePath(path);
  const last = keys.pop();
  const obj = keys.reduce((v, k) => v?.[k], source);
  if (obj) obj[last] = value;
};
const prop = (node, name, value) => {
  if (value != null) node.setAttribute(name, String(value));
  return node;
};
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
function subscribe(event, callback) {
  if (event?.subscribe) {
    const d = event.subscribe(callback);
    return typeof d === 'function' ? d : () => d?.dispose?.();
  }
  return () => {};
}

/** A native, shadow-DOM ribbon with framework-neutral events and .NET-style models. */
export class RibbonElement extends HTMLElementBase {
  static get observedAttributes() {
    return ['theme', 'layout', 'density', 'dir', 'minimized'];
  }
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._model = null;
    this._subscriptions = [];
    this._scheduled = false;
    this._context = {};
    this._hiddenTabs = new Set();
    this._hiddenGroups = new Set();
    this._qatIds = null;
    this._actions = new Map();
    this._actionId = 0;
    this._popup = null;
    this._keyScope = null;
    this._keyBuffer = '';
    this._active = false;
    this._selection = null;
    this._previewed = null;
    this._onDocumentKey = (e) => this._documentKey(e);
    this._onOutside = (e) => {
      if (!e.composedPath().includes(this)) {
        this.closePopup();
        this._setKeyTips(null);
        if (this._peek) {
          this._peek = false;
          this.requestRender();
        }
      }
    };
    this.shadowRoot.addEventListener('click', (e) => {
      const n = e.composedPath().find((n) => n?.dataset?.action);
      if (n && !n.disabled) this._actions.get(n.dataset.action)?.(e, n);
    });
    this.shadowRoot.addEventListener('keydown', (e) => this._keyDown(e));
    this.shadowRoot.addEventListener('pointerover', (e) => this._showTooltip(e));
    this.shadowRoot.addEventListener('pointerout', () => this._hideTooltip());
    this.shadowRoot.addEventListener('focusin', () => (this._active = true));
  }
  connectedCallback() {
    if (!this._model) this.model = this._readMarkup();
    if (this.getAttribute('theme') == null)
      this.setAttribute('theme', this._model.theme || 'light');
    document.addEventListener('keydown', this._onDocumentKey);
    document.addEventListener('pointerdown', this._onOutside);
    this._resize = new ResizeObserver(() => {
      this.closePopup();
      this._adapt();
    });
    this._resize.observe(this);
    this._subscribe();
    this.requestRender();
  }
  disconnectedCallback() {
    document.removeEventListener('keydown', this._onDocumentKey);
    document.removeEventListener('pointerdown', this._onOutside);
    this._resize?.disconnect();
    this._unsubscribe();
    this.closePopup();
    this._hideTooltip();
  }
  attributeChangedCallback() {
    this.requestRender();
  }
  get model() {
    return this._model;
  }
  set model(value) {
    this._unsubscribe();
    this._model = normalizeRibbon(value || {});
    this._selected = this._model.selectedTab || list(this._model.tabs)[0]?.id;
    this._context = { ...this._model.context };
    this._hiddenTabs.clear();
    this._hiddenGroups.clear();
    this._qatIds = null;
    this._customLoaded = false;
    this._defaults = {
      version: 1,
      layout: this._model.layout || 'classic',
      theme: this._model.theme || 'light',
      selectedTab: this._selected,
      minimized: false,
      hiddenTabs: [],
      hiddenGroups: [],
      quickAccessToolbar: null,
      tabOrder: this._model.tabs.map((t) => t.id),
      tabLabels: Object.fromEntries(this._model.tabs.map((t) => [t.id, t.header])),
      groupOrder: Object.fromEntries(
        this._model.tabs.map((t) => [t.id, t.groups.map((g) => g.id)]),
      ),
    };
    this._subscribe();
    this.requestRender();
  }
  get Model() {
    return this.model;
  }
  set Model(value) {
    this.model = value;
  }
  get dataContext() {
    return this._dataContext;
  }
  set dataContext(value) {
    this._dataContext = value;
    this._subscribe();
    this.requestRender();
  }
  get DataContext() {
    return this.dataContext;
  }
  set DataContext(value) {
    this.dataContext = value;
  }
  get selectedTab() {
    return this._selected;
  }
  set selectedTab(value) {
    this.selectTab(value);
  }
  get SelectedTab() {
    return this.selectedTab;
  }
  set SelectedTab(value) {
    this.selectTab(value);
  }
  get layout() {
    return this.getAttribute('layout') || this._model?.layout || 'classic';
  }
  set layout(v) {
    this.setAttribute('layout', v);
  }
  get minimized() {
    return this.hasAttribute('minimized');
  }
  set minimized(v) {
    this.toggleAttribute('minimized', !!v);
    this._peek = false;
  }
  get theme() {
    return this.getAttribute('theme') || 'light';
  }
  set theme(v) {
    this.setAttribute('theme', v);
  }
  _unsubscribe() {
    this._subscriptions.splice(0).forEach((d) => d());
  }
  _subscribe() {
    this._unsubscribe();
    if (!this._model) return;
    const seen = new WeakSet();
    const walk = (v) => {
      if (!v || typeof v !== 'object' || seen.has(v)) return;
      seen.add(v);
      for (const k of ['PropertyChanged', 'CollectionChanged', 'CanExecuteChanged'])
        this._subscriptions.push(
          subscribe(v[k], (event) => {
            if (v === this._model) {
              if (event?.propertyName === 'selectedTab') this._selected = this._model.selectedTab;
              if (event?.propertyName === 'context') this._context = { ...this._model.context };
            }
            this.requestRender();
            if (
              k === 'CollectionChanged' ||
              (k === 'PropertyChanged' && event?.newValue && typeof event.newValue === 'object')
            )
              queueMicrotask(() => this._subscribe());
          }),
        );
      for (const [k, x] of Object.entries(v)) {
        if (
          k.startsWith('_') ||
          k === 'PropertyChanged' ||
          k === 'CollectionChanged' ||
          k === 'CanExecuteChanged'
        )
          continue;
        if (Array.isArray(x)) x.forEach(walk);
        else if (x && typeof x === 'object') walk(x);
      }
    };
    walk(this._model);
    walk(this._dataContext);
  }
  _emit(name, detail = {}, cancelable = false) {
    return this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true, cancelable }),
    );
  }
  requestRender() {
    if (this._scheduled) return;
    this._scheduled = true;
    queueMicrotask(() => {
      this._scheduled = false;
      if (this.isConnected) this.render();
    });
  }
  invalidate() {
    this._subscribe();
    this.requestRender();
  }
  Invalidate() {
    this.invalidate();
  }
  updateControl(id, changes) {
    const c = this.getControl(id);
    if (!c) throw new Error(`Unknown ribbon control: ${id}`);
    for (const [key, value] of Object.entries(changes)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key))
        throw new TypeError('Unsafe control property');
      if (c.SetProperty) c.SetProperty(key, value);
      else c[key] = value;
    }
    this._subscribe();
    this.requestRender();
    return c;
  }
  UpdateControl(id, changes) {
    return this.updateControl(id, changes);
  }
  getControl(id) {
    return findControl(this._model, id);
  }
  GetControl(id) {
    return this.getControl(id);
  }
  setContext(name, active = true) {
    this._context[name] = !!active;
    this._model.context = { ...this._context };
    this._emit('ribbon-context-change', { name, active: !!active });
    this.requestRender();
  }
  SetContext(name, active) {
    this.setContext(name, active);
  }
  selectTab(id) {
    const tab = list(this._model?.tabs).find((t) => t.id === id);
    if (!tab || !this._tabVisible(tab)) return false;
    this._selected = id;
    this._model.selectedTab = id;
    this._backstage = false;
    this._peek = this.minimized;
    this.closePopup();
    this.requestRender();
    this._emit('ribbon-tab-change', { id });
    return true;
  }
  ActivateTab(id) {
    return this.selectTab(id);
  }
  _resolve(c, key) {
    const binding = c.bindings?.[key];
    if (binding) {
      const b = typeof binding === 'string' ? { path: binding } : binding;
      const value = read(this.dataContext, b.path || b.Path);
      const cv = b.converter || b.Converter;
      return cv?.Convert
        ? cv.Convert(value)
        : cv?.convert
          ? cv.convert(value)
          : typeof cv === 'function'
            ? cv(value)
            : value;
    }
    return c[key];
  }
  _visible(c) {
    return this._resolve(c, 'visible') !== false;
  }
  _enabled(c) {
    const cmd = this._resolve(c, 'command');
    try {
      return (
        this._resolve(c, 'enabled') !== false &&
        !(cmd?.IsRunning || cmd?.isRunning) &&
        (cmd?.CanExecute
          ? cmd.CanExecute(this._resolve(c, 'commandParameter'))
          : cmd?.canExecute
            ? cmd.canExecute(this._resolve(c, 'commandParameter'))
            : true)
      );
    } catch (error) {
      this._emit('ribbon-error', { id: c.id, error });
      return false;
    }
  }
  _tabVisible(t) {
    return (
      this._visible(t) &&
      !this._hiddenTabs.has(t.id) &&
      (!t.contextualGroup || this._context[t.contextualGroup] === true)
    );
  }
  _setValue(c, key, value) {
    c[key] = value;
    const raw = c.bindings?.[key];
    const b = typeof raw === 'string' ? { path: raw, mode: 'TwoWay' } : raw;
    if (b && (b.mode || b.Mode || 'TwoWay') === 'TwoWay') {
      const cv = b.converter || b.Converter;
      write(
        this.dataContext,
        b.path || b.Path,
        cv?.ConvertBack ? cv.ConvertBack(value) : cv?.convertBack ? cv.convertBack(value) : value,
      );
    }
    this._emit('ribbon-change', { id: c.id, property: key, value });
    c.onChange?.(value, c);
  }
  async execute(idOrControl, value) {
    const c = typeof idOrControl === 'string' ? this.getControl(idOrControl) : idOrControl;
    if (!c || !this._enabled(c) || !this._visible(c)) return false;
    const detail = {
      id: c.id,
      value: value ?? this._resolve(c, 'value'),
      parameter: this._resolve(c, 'commandParameter'),
      control: c,
    };
    if (!this._emit('ribbon-command-executing', detail, true)) return false;
    try {
      if (c.type === 'toggle' || c.type === 'checkbox')
        this._setValue(c, 'checked', !this._resolve(c, 'checked'));
      if (c.type === 'radio') {
        for (const other of this._allControls())
          if (other.type === 'radio' && other.groupName === c.groupName)
            this._setValue(other, 'checked', other.id === c.id);
      }
      if (value !== undefined) this._setValue(c, 'value', value);
      const cmd = this._resolve(c, 'command');
      const result =
        typeof cmd === 'function'
          ? cmd(this._resolve(c, 'commandParameter') ?? value, c)
          : cmd?.Execute
            ? cmd.Execute(this._resolve(c, 'commandParameter') ?? value)
            : cmd?.execute?.(this._resolve(c, 'commandParameter') ?? value);
      if (result?.then) {
        c.busy = true;
        this.requestRender();
        await result;
      }
      this._emit('ribbon-command', {
        ...detail,
        value: ['toggle', 'checkbox', 'radio'].includes(c.type) ? c.checked : c.value,
      });
      return true;
    } catch (error) {
      this._emit('ribbon-error', { id: c.id, error });
      return false;
    } finally {
      c.busy = false;
      this.requestRender();
    }
  }
  Execute(id, value) {
    return this.execute(id, value);
  }
  _allControls() {
    const result = [];
    const walk = (items) =>
      list(items).forEach((c) => {
        result.push(c);
        walk(c.items);
      });
    for (const t of list(this._model?.tabs)) for (const g of list(t.groups)) walk(g.items);
    walk(this._model?.quickAccessToolbar);
    walk(this._backstageItems());
    return result;
  }
  _backstageItems() {
    const value = this._model?.backstage;
    return Array.isArray(value) ? value : value?.items || [];
  }
  _readMarkup() {
    const parse = (n) => {
      const v = {};
      for (const a of n.attributes) {
        const key = a.name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        v[key] = a.value === 'false' ? false : a.value === 'true' ? true : a.value;
      }
      v.type = n.localName.replace(/^ribbon-/, '');
      v.id ||= n.id || `control-${++this._actionId}`;
      if (n.children.length)
        v.items = Array.from(n.children)
          .filter((c) => c.localName.startsWith('ribbon-'))
          .map(parse);
      return v;
    };
    return {
      tabs: Array.from(this.children)
        .filter((n) => n.localName === 'ribbon-tab')
        .map((n) => ({
          ...parse(n),
          header: n.getAttribute('header') || n.getAttribute('label'),
          groups: Array.from(n.children)
            .filter((g) => g.localName === 'ribbon-group')
            .map((g) => ({
              ...parse(g),
              header: g.getAttribute('header') || g.getAttribute('label'),
            })),
        })),
    };
  }
  _button(label, action, { icon, title, cls = '', keyTip, disabled = false } = {}) {
    const b = el('button', cls);
    b.type = 'button';
    b.disabled = disabled;
    if (icon) b.append(createIcon(icon));
    if (label) b.append(el('span', 'label', label));
    if (title) {
      b.dataset.tooltip = title;
      prop(b, 'aria-label', title);
    } else if (label) prop(b, 'aria-label', label);
    this._action(b, action);
    if (keyTip) b.dataset.keyTip = keyTip;
    return b;
  }
  _action(node, fn) {
    const id = String(++this._actionId);
    node.dataset.action = id;
    this._actions.set(id, fn);
    return node;
  }
  render() {
    if (!this._model) return;
    const focus = this.shadowRoot.activeElement;
    const focusId = focus?.dataset?.focusId;
    const selection =
      focus?.selectionStart != null ? [focus.selectionStart, focus.selectionEnd] : null;
    this.closePopup(false);
    this._hideTooltip();
    this._actions.clear();
    this._actionId = 0;
    this.shadowRoot.replaceChildren(el('style', '', styles));
    if (!this._customLoaded) {
      this._customLoaded = true;
      this.loadCustomization();
    }
    const shell = el('div', `shell ${this.layout === 'simplified' ? 'simplified' : ''}`);
    shell.part = 'ribbon';
    this.shadowRoot.append(shell);
    const top = el('div', 'topline');
    const qat = el('div', 'qat');
    prop(qat, 'role', 'toolbar');
    prop(qat, 'aria-label', 'Quick access toolbar');
    let qatControls = this._qatIds
      ? this._qatIds.map((id) => this.getControl(id)).filter(Boolean)
      : list(this._model.quickAccessToolbar);
    qatControls
      .filter((c) => this._visible(c))
      .forEach((c, i) => {
        const b = this._commandButton(c, () => this.execute(c));
        b.dataset.keyTip = String(i + 1);
        qat.append(b);
      });
    qat.append(
      this._button('⌄', () => this.openQuickAccessMenu(), {
        title: 'Customize quick access toolbar',
      }),
    );
    top.append(qat, el('span', 'title', this._model.title || 'RibbonWeb'));
    top.append(
      this._button('Search commands', (_, n) => this.openSearch(n), {
        icon: 'search',
        cls: 'search-button',
        title: 'Search commands (Alt+Q)',
      }),
    );
    shell.append(top);
    const row = el('div', 'tabs-row');
    row.append(
      this._button(this._model.fileLabel || 'File', () => this.openBackstage(), {
        cls: 'file-tab',
        keyTip: 'F',
      }),
    );
    const tabs = el('div', 'tabs');
    prop(tabs, 'role', 'tablist');
    prop(tabs, 'aria-label', 'Ribbon tabs');
    const visibleTabs = list(this._model.tabs).filter((t) => this._tabVisible(t));
    if (!visibleTabs.some((t) => t.id === this._selected)) {
      this._selected = visibleTabs[0]?.id;
      if (this._model.selectedTab !== this._selected) this._model.selectedTab = this._selected;
    }
    for (const t of visibleTabs) {
      const b = this._button(t.header || t.label, () => this.selectTab(t.id), {
        cls: `tab ${t.contextualGroup ? 'contextual' : ''}`,
        keyTip: t.keyTip,
      });
      b.id = `tab-${t.id}`;
      b.dataset.focusId = b.id;
      b.dataset.tabId = t.id;
      prop(b, 'role', 'tab');
      prop(b, 'aria-selected', this._selected === t.id);
      prop(b, 'aria-controls', `panel-${t.id}`);
      b.tabIndex = this._selected === t.id ? 0 : -1;
      if (t.contextColor) b.style.setProperty('--rw-context', t.contextColor);
      b.addEventListener('dblclick', () => (this.minimized = !this.minimized));
      tabs.append(b);
    }
    row.append(
      tabs,
      this._button('⌃', () => (this.minimized = !this.minimized), {
        cls: 'chrome-button',
        title: this.minimized ? 'Expand ribbon' : 'Minimize ribbon (Ctrl+F1)',
      }),
      this._button(
        '⋯',
        (_, n) =>
          this._openMenu(
            [
              {
                id: 'layout',
                label: this.layout === 'classic' ? 'Use simplified ribbon' : 'Use classic ribbon',
                command: () => (this.layout = this.layout === 'classic' ? 'simplified' : 'classic'),
              },
              {
                id: 'customize',
                label: 'Customize ribbon',
                command: () => this.openCustomization(),
              },
              {
                id: 'touch',
                label:
                  this.getAttribute('density') === 'touch'
                    ? 'Use mouse spacing'
                    : 'Use touch spacing',
                command: () =>
                  this.setAttribute(
                    'density',
                    this.getAttribute('density') === 'touch' ? 'compact' : 'touch',
                  ),
              },
              {
                id: 'theme',
                label: this.theme === 'dark' ? 'Use light theme' : 'Use dark theme',
                command: () => (this.theme = this.theme === 'dark' ? 'light' : 'dark'),
              },
            ],
            n,
          ),
        { cls: 'chrome-button', title: 'Ribbon options' },
      ),
    );
    shell.append(row);
    if (this._backstage) this._renderBackstage(shell);
    else if (!this.minimized || this._peek) {
      const t = visibleTabs.find((t) => t.id === this._selected);
      if (t) {
        const panel = el('div', `panel ${this.minimized ? 'floating-panel' : ''}`);
        panel.part = 'panel';
        panel.id = `panel-${t.id}`;
        prop(panel, 'role', 'tabpanel');
        prop(panel, 'aria-labelledby', `tab-${t.id}`);
        for (const g of list(t.groups).filter(
          (g) => this._visible(g) && !this._hiddenGroups.has(g.id),
        ))
          panel.append(this._renderGroup(g));
        const more = this._button('More', (_, n) => this._openOverflow(n), {
          icon: 'grid',
          cls: 'overflow-button',
          title: 'More ribbon groups',
        });
        more.hidden = true;
        more.dataset.overflow = 'true';
        panel.append(more);
        shell.append(panel);
      }
    }
    const status = el('span', 'sr-only');
    status.setAttribute('aria-live', 'polite');
    status.textContent = this._announcement || '';
    shell.append(status);
    this._adapt();
    this._paintKeyTips();
    if (focusId) {
      const next = [...this.shadowRoot.querySelectorAll('[data-focus-id]')].find(
        (n) => n.dataset.focusId === focusId,
      );
      if (next) {
        next.focus({ preventScroll: true });
        if (selection && next.setSelectionRange)
          try {
            next.setSelectionRange(...selection);
          } catch {}
      }
    }
  }
  _renderGroup(g) {
    const section = el('section', 'group');
    section.dataset.groupId = g.id;
    section.dataset.priority = g.priority ?? 0;
    prop(section, 'aria-label', g.header || g.label);
    section.part = 'group';
    const items = el('div', 'group-items');
    let stack = null;
    for (const c of list(g.items).filter((c) => this._visible(c))) {
      if (
        c.size === 'large' ||
        c.type === 'gallery' ||
        c.type === 'separator' ||
        c.type === 'custom'
      ) {
        stack = null;
        items.append(this._renderControl(c));
      } else {
        if (!stack || stack.children.length >= 3) {
          stack = el('div', 'control-stack');
          items.append(stack);
        }
        stack.append(this._renderControl(c));
      }
    }
    section.append(items);
    const cap = el('div', 'group-caption', g.header || g.label);
    if (g.launcher) {
      cap.append(
        this._button(
          '↗',
          () => {
            if (typeof g.launcher === 'function') g.launcher(g);
            else if (g.launcher.Execute) g.launcher.Execute(g);
            else if (g.launcher.execute) g.launcher.execute(g);
            else this.execute(g.launcher);
            this._emit('ribbon-launcher', { id: g.id });
          },
          {
            cls: 'launcher',
            title: `${g.header} settings`,
            disabled: g.launcher?.CanExecute
              ? !g.launcher.CanExecute(g)
              : g.launcher?.execute
                ? false
                : g.launcher?.enabled === false,
          },
        ),
      );
    }
    section.append(cap);
    return section;
  }
  _commandButton(c, action) {
    const b = this._button(
      c.showLabel === false ? '' : this._resolve(c, 'label') || c.header || c.id,
      action,
      {
        icon: c.showIcon === false ? null : this._resolve(c, 'icon'),
        title: this._resolve(c, 'tooltip') || this._resolve(c, 'label') || c.id,
        keyTip: c.keyTip,
        disabled: !this._enabled(c) || c.busy,
      },
    );
    b.dataset.controlId = c.id;
    b.dataset.focusId = `control-${c.id}`;
    if (c.description) b.dataset.description = c.description;
    if (c.shortcut) b.dataset.shortcut = c.shortcut;
    if (['toggle', 'checkbox', 'radio'].includes(c.type))
      prop(b, c.type === 'toggle' ? 'aria-pressed' : 'aria-checked', !!this._resolve(c, 'checked'));
    if (c.type === 'checkbox') prop(b, 'role', 'checkbox');
    if (c.type === 'radio') prop(b, 'role', 'radio');
    return b;
  }
  _renderControl(c, inMenu = false) {
    const wrap = el('div', `control ${c.size === 'large' ? 'large' : 'small'}`);
    wrap.dataset.id = c.id;
    wrap.part = 'control';
    const value = this._resolve(c, 'value');
    const enabled = this._enabled(c);
    let node;
    if (c.type === 'separator') {
      wrap.className = 'separator';
      prop(wrap, 'role', 'separator');
      return wrap;
    }
    if (c.type === 'label') {
      wrap.append(el('span', '', this._resolve(c, 'label')));
      return wrap;
    }
    if (c.type === 'custom') {
      if (typeof c.render === 'function') {
        const result = c.render({ control: c, ribbon: this, document });
        if (result instanceof Node) wrap.append(result);
      } else if (c.slot) {
        const slot = el('slot');
        slot.name = c.slot;
        wrap.append(slot);
      }
      return wrap;
    }
    if (['textbox', 'combobox', 'dropdown', 'spinner', 'slider', 'color'].includes(c.type)) {
      const label = el('label', '', c.label);
      if (c.showLabel !== false) wrap.append(label);
      if (c.type === 'dropdown') {
        node = el('select');
        for (const item of list(c.items)) {
          const o = el('option', '', item.label ?? item.Label ?? String(item));
          o.value = item.value ?? item.id ?? item;
          node.append(o);
        }
      } else {
        node = el('input');
        node.type = { spinner: 'number', slider: 'range', color: 'color' }[c.type] || 'text';
        if (c.type === 'combobox') {
          const dl = el('datalist');
          dl.id = `list-${c.id}`;
          for (const item of list(c.items)) {
            const o = el('option');
            o.value = item.value ?? item.label ?? item.id ?? item;
            dl.append(o);
          }
          node.setAttribute('list', dl.id);
          wrap.append(dl);
        }
      }
      node.id = `input-${c.id}`;
      if (c.keyTip) node.dataset.keyTip = c.keyTip;
      node.dataset.focusId = node.id;
      label.htmlFor = node.id;
      prop(node, 'aria-label', c.label || c.id);
      node.disabled = !enabled;
      node.value = value ?? '';
      if (c.width) node.style.width = typeof c.width === 'number' ? `${c.width}px` : c.width;
      for (const k of ['min', 'max', 'step', 'placeholder', 'maxLength'])
        if (c[k] != null) node[k] = c[k];
      node.addEventListener('change', () => {
        const next = ['spinner', 'slider'].includes(c.type) ? Number(node.value) : node.value;
        if (c.validate && !c.validate(next)) {
          node.setCustomValidity(c.validationMessage || 'Invalid value');
          node.reportValidity();
          return;
        }
        node.setCustomValidity('');
        this.execute(c, next);
      });
      if (c.type === 'slider' || c.type === 'color')
        node.addEventListener('input', () =>
          this._emit('ribbon-preview', {
            id: c.id,
            value: c.type === 'slider' ? Number(node.value) : node.value,
          }),
        );
      wrap.append(node);
      return wrap;
    }
    if (c.type === 'gallery') {
      const inline = el('div', 'gallery-inline');
      prop(inline, 'role', 'listbox');
      prop(inline, 'aria-label', c.label);
      for (const item of list(c.items).slice(0, c.inlineCount || 3))
        inline.append(this._galleryItem(c, item));
      wrap.append(
        inline,
        this._button('⌄', (_, n) => this._openGallery(c, n), {
          title: `More ${c.label || 'gallery items'}`,
          disabled: !enabled,
        }),
      );
      return wrap;
    }
    if (c.type === 'split') {
      const split = el('div', 'split');
      split.append(this._commandButton(c, () => this.execute(c)));
      split.firstChild.classList.add('split-main');
      const arrow = this._button('⌄', (_, n) => this._openControlMenu(c, n), {
        cls: 'split-arrow',
        title: `${c.label} options`,
        disabled: !enabled,
      });
      prop(arrow, 'aria-haspopup', 'menu');
      prop(arrow, 'aria-expanded', false);
      split.append(arrow);
      wrap.append(split);
      return wrap;
    }
    node = this._commandButton(c, (_, n) => {
      if (c.type === 'menu') this._openControlMenu(c, n);
      else {
        this.execute(c);
        if (inMenu) this.closePopup();
      }
    });
    if (c.type === 'menu') {
      node.append(el('span', 'chevron', '⌄'));
      prop(node, 'aria-haspopup', 'menu');
      prop(node, 'aria-expanded', false);
    }
    wrap.append(node);
    return wrap;
  }
  _galleryItem(c, item) {
    const value = item.value ?? item.id ?? item;
    const b = this._button(
      '',
      () => {
        this._previewed = null;
        this._emit('ribbon-preview-end', { id: c.id, committed: true, value });
        this.execute(c, value);
        this.closePopup();
      },
      { cls: 'gallery-tile', disabled: !this._enabled(c) },
    );
    prop(b, 'role', 'option');
    prop(b, 'aria-label', item.label || String(value));
    prop(b, 'aria-selected', this._resolve(c, 'value') === value);
    if (item.icon) b.append(createIcon(item.icon));
    const preview = el('span', 'gallery-preview', item.preview || 'AaBb');
    for (const [key, v] of Object.entries(item.style || {}))
      if (
        [
          'fontFamily',
          'fontSize',
          'fontWeight',
          'fontStyle',
          'color',
          'backgroundColor',
          'textDecoration',
          'textAlign',
          'borderColor',
        ].includes(key)
      )
        preview.style[key] = v;
    b.append(preview, el('span', 'item-label', item.label || String(value)));
    b.addEventListener('pointerenter', () => {
      this._previewed = c;
      this._emit('ribbon-preview', { id: c.id, value, item });
      c.preview?.(value, item);
    });
    b.addEventListener('focus', () => {
      this._previewed = c;
      this._emit('ribbon-preview', { id: c.id, value, item });
      c.preview?.(value, item);
    });
    b.addEventListener('blur', () => this._endPreview(c));
    b.addEventListener('pointerleave', () => this._endPreview(c));
    return b;
  }
  _endPreview(c) {
    if (this._previewed?.id !== c.id) return;
    this._previewed = null;
    this._emit('ribbon-preview-end', { id: c.id, committed: false });
    c.cancelPreview?.();
  }
  _adapt() {
    const panel = this.shadowRoot.querySelector('.panel');
    if (!panel) return;
    const groups = [...panel.querySelectorAll(':scope > .group')];
    const more = panel.querySelector('[data-overflow]');
    if (!more) return;
    groups.forEach((g) => (g.hidden = false));
    more.hidden = true;
    let used = groups.reduce((s, g) => s + g.getBoundingClientRect().width, 0);
    const available = panel.clientWidth - 12;
    this._overflowGroups = [];
    if (used > available) {
      more.hidden = false;
      const sorted = [...groups].sort(
        (a, b) =>
          Number(a.dataset.priority) - Number(b.dataset.priority) ||
          groups.indexOf(b) - groups.indexOf(a),
      );
      for (const g of sorted) {
        if (used <= available - 60) break;
        used -= g.getBoundingClientRect().width;
        g.hidden = true;
        this._overflowGroups.push(g.dataset.groupId);
      }
      for (const g of [...sorted].reverse()) {
        if (!g.hidden) continue;
        g.hidden = false;
        const width = g.getBoundingClientRect().width;
        if (used + width <= available - 60) {
          used += width;
          this._overflowGroups = this._overflowGroups.filter((id) => id !== g.dataset.groupId);
        } else g.hidden = true;
      }
    }
    panel.classList.toggle('all-overflow', groups.length > 0 && groups.every((g) => g.hidden));
  }
  _openOverflow(anchor) {
    const tab = list(this._model.tabs).find((t) => t.id === this._selected);
    this._openMenu(
      list(tab.groups)
        .filter((g) => this._overflowGroups.includes(g.id))
        .map((g) => ({ id: g.id, label: g.header, type: 'menu', items: list(g.items) })),
      anchor,
    );
  }
  _newPopup(anchor, cls = '') {
    this.closePopup(false);
    this._menuItems = null;
    const popup = el('div', `popup ${cls}`);
    this._popup = popup;
    this._popupAnchor = anchor;
    this.shadowRoot.append(popup);
    if (anchor) prop(anchor, 'aria-expanded', true);
    return popup;
  }
  _positionPopup(anchor) {
    if (!this._popup) return;
    const r = anchor?.getBoundingClientRect() || this.getBoundingClientRect();
    const p = this._popup;
    const w = p.getBoundingClientRect().width;
    const h = p.getBoundingClientRect().height;
    const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
    const below = r.bottom + 4;
    const top = Math.max(
      8,
      below + h > innerHeight - 8 ? Math.min(r.top - h - 4, innerHeight - h - 8) : below,
    );
    p.style.left = `${left}px`;
    p.style.top = `${top}px`;
  }
  closePopup(restore = true) {
    if (this._previewed) this._endPreview(this._previewed);
    const anchor = this._popupAnchor;
    this._popup?.remove();
    this._popup = null;
    this._popupAnchor = null;
    if (anchor?.hasAttribute('aria-expanded')) prop(anchor, 'aria-expanded', false);
    if (restore && anchor?.isConnected) anchor.focus({ preventScroll: true });
  }
  async _openControlMenu(c, anchor) {
    try {
      const items = c.getItems ? await c.getItems(c) : c.items;
      if (anchor.isConnected) this._openMenu(list(items), anchor);
    } catch (error) {
      this._emit('ribbon-error', { id: c.id, error });
    }
  }
  _openMenu(items, anchor, parentOverride) {
    const parent =
      parentOverride !== undefined
        ? parentOverride
        : this._popup?.contains(anchor)
          ? {
              items: this._menuItems,
              anchor: this._popupAnchor,
              id: anchor.dataset.controlId,
              parent: this._menuParent,
            }
          : null;
    if (parent) anchor = parent.anchor;
    const popup = this._newPopup(anchor);
    this._menuItems = items;
    this._menuParent = parent;
    prop(popup, 'role', 'menu');
    const content = el('div', 'menu-items');
    if (parent)
      content.append(
        this._button(
          '‹ Back',
          () => {
            this._openMenu(parent.items, parent.anchor, parent.parent);
            [...this._popup.querySelectorAll('[data-control-id]')]
              .find((n) => n.dataset.controlId === parent.id)
              ?.focus();
          },
          { title: 'Back to previous menu' },
        ),
      );
    for (const c of list(items).filter((c) => this._visible(c))) {
      if (c.type === 'separator') {
        content.append(el('div', 'menu-separator'));
        continue;
      }
      if (c.type === 'label') {
        content.append(el('div', 'menu-heading', c.label));
        continue;
      }
      if (
        [
          'textbox',
          'dropdown',
          'combobox',
          'color',
          'spinner',
          'slider',
          'gallery',
          'custom',
        ].includes(c.type)
      ) {
        content.append(this._renderControl(c, true));
        continue;
      }
      const b = this._commandButton(c, (_, n) => {
        if (c.items?.length || c.getItems) {
          this._openControlMenu(c, n);
        } else {
          this.closePopup();
          this.execute(c);
        }
      });
      prop(
        b,
        'role',
        c.type === 'checkbox' || c.type === 'toggle'
          ? 'menuitemcheckbox'
          : c.type === 'radio'
            ? 'menuitemradio'
            : 'menuitem',
      );
      if (['checkbox', 'toggle', 'radio'].includes(c.type))
        prop(b, 'aria-checked', !!this._resolve(c, 'checked'));
      if (c.shortcut) b.append(el('span', 'shortcut', c.shortcut));
      if (c.items?.length || c.getItems) {
        b.append(el('span', 'chevron', '›'));
        prop(b, 'aria-haspopup', 'menu');
      }
      content.append(b);
    }
    popup.append(content);
    this._positionPopup(anchor);
    popup.querySelector('button:not(:disabled),input,select')?.focus({ preventScroll: true });
  }
  _openGallery(c, anchor) {
    const popup = this._newPopup(anchor);
    prop(popup, 'role', 'dialog');
    prop(popup, 'aria-label', c.label);
    popup.append(el('h3', '', c.label));
    const categories = [
      ...new Set(
        list(c.items)
          .map((i) => i.category)
          .filter(Boolean),
      ),
    ];
    const filter = el('select', 'gallery-filter');
    prop(filter, 'aria-label', 'Gallery category');
    for (const name of ['All', ...categories]) {
      const option = el('option', '', name);
      option.value = name;
      filter.append(option);
    }
    if (categories.length) popup.append(filter);
    const grid = el('div', 'gallery-grid');
    grid.style.setProperty('--gallery-cols', c.columns || 4);
    prop(grid, 'role', 'listbox');
    prop(grid, 'aria-label', c.label);
    const fill = () => {
      grid.replaceChildren(
        ...list(c.items)
          .filter((i) => filter.value === 'All' || i.category === filter.value)
          .map((i) => this._galleryItem(c, i)),
      );
    };
    filter.addEventListener('change', fill);
    popup.append(grid);
    fill();
    this._positionPopup(anchor);
    popup.querySelector('select,button:not(:disabled)')?.focus();
  }
  openBackstage(id) {
    this.closePopup();
    this._backstage = true;
    this._backstagePage = id || list(this._backstageItems())[0]?.id;
    this._emit('ribbon-backstage-change', { open: true, id: this._backstagePage });
    this.requestRender();
  }
  closeBackstage() {
    this._backstage = false;
    this._emit('ribbon-backstage-change', { open: false });
    this.requestRender();
  }
  _renderBackstage(shell) {
    const section = el('div', 'backstage');
    const nav = el('nav', 'back-nav');
    prop(nav, 'aria-label', 'File');
    nav.append(this._button('Back', () => this.closeBackstage(), { icon: 'undo' }));
    for (const item of list(this._backstageItems())) {
      nav.append(
        this._button(
          item.label,
          () => {
            if (item.command) this.execute(item);
            else {
              this._backstagePage = item.id;
              this.requestRender();
            }
          },
          { icon: item.icon, disabled: !this._enabled(item) },
        ),
      );
    }
    const content = el('div', 'back-content');
    const page = list(this._backstageItems()).find((i) => i.id === this._backstagePage);
    content.append(el('h2', '', page?.label || 'File'));
    if (page?.render) {
      const node = page.render({ ribbon: this, document });
      if (node instanceof Node) content.append(node);
    } else {
      if (page?.description) content.append(el('p', '', page.description));
      for (const c of list(page?.items)) content.append(this._renderControl(c));
      if (page?.slot) {
        const slot = el('slot');
        slot.name = page.slot;
        content.append(slot);
      }
    }
    section.append(nav, content);
    shell.append(section);
  }
  openSearch(anchor = this.shadowRoot.querySelector('.search-button')) {
    const popup = this._newPopup(anchor);
    prop(popup, 'role', 'dialog');
    prop(popup, 'aria-label', 'Search commands');
    const input = el('input', 'search-input');
    input.placeholder = 'Search all commands…';
    prop(input, 'aria-label', 'Search commands');
    const results = el('div', 'search-results');
    const fill = () => {
      results.replaceChildren();
      const q = input.value.toLowerCase();
      const seen = new Set();
      for (const c of this._allControls().filter(
        (c) =>
          c.label &&
          c.type !== 'separator' &&
          c.type !== 'label' &&
          this._visible(c) &&
          `${c.label} ${c.description || ''}`.toLowerCase().includes(q),
      )) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        if (seen.size > 40) break;
        results.append(
          this._commandButton(c, (_, n) => {
            if (c.type === 'menu' || c.type === 'split') this._openControlMenu(c, n);
            else if (c.type === 'gallery') this._openGallery(c, n);
            else if (
              ['dropdown', 'textbox', 'combobox', 'color', 'spinner', 'slider'].includes(c.type)
            ) {
              const p = this._newPopup(anchor);
              p.append(this._renderControl(c));
              this._positionPopup(anchor);
              p.querySelector('input,select')?.focus();
            } else {
              this.closePopup();
              this.execute(c);
            }
          }),
        );
      }
      if (!results.children.length) results.append(el('div', 'empty', 'No matching commands'));
    };
    input.addEventListener('input', fill);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        results.querySelector('button:not(:disabled)')?.focus();
      }
      if (e.key === 'Enter') results.querySelector('button:not(:disabled)')?.click();
    });
    popup.append(input, results);
    fill();
    this._positionPopup(anchor);
    input.focus();
  }
  showContextMenu(items, position = {}) {
    const anchor = el('span');
    Object.assign(anchor.style, {
      position: 'fixed',
      left: `${position.x ?? 20}px`,
      top: `${position.y ?? 20}px`,
    });
    this.shadowRoot.append(anchor);
    this._openMenu(
      items.map((i) => (typeof i === 'string' ? this.getControl(i) : i)).filter(Boolean),
      anchor,
    );
    anchor.remove();
  }
  showMiniToolbar(items, position = {}) {
    this.showContextMenu(items, position);
    this._popup?.setAttribute('role', 'toolbar');
    this._popup?.setAttribute('aria-label', 'Selection formatting');
    if (this._popup) this._popup.querySelector('.menu-items').style.flexDirection = 'row';
  }
  openQuickAccessMenu() {
    const ids = this._qatIds || list(this._model.quickAccessToolbar).map((c) => c.id);
    const choices = this._allControls().filter(
      (c) => c.label && ['button', 'toggle'].includes(c.type),
    );
    const seen = new Set();
    this._openMenu(
      choices
        .filter((c) => !seen.has(c.id) && seen.add(c.id))
        .map((c) => ({
          id: `qat-${c.id}`,
          type: 'toggle',
          label: c.label,
          checked: ids.includes(c.id),
          command: () => {
            this._qatIds = ids.includes(c.id) ? ids.filter((id) => id !== c.id) : [...ids, c.id];
            this.saveCustomization();
            this.requestRender();
          },
        })),
      this.shadowRoot.querySelector('.qat'),
    );
  }
  exportCustomization() {
    return {
      version: 1,
      selectedTab: this._selected,
      layout: this.layout,
      theme: this.theme,
      minimized: this.minimized,
      hiddenTabs: [...this._hiddenTabs],
      hiddenGroups: [...this._hiddenGroups],
      quickAccessToolbar: this._qatIds,
      tabOrder: list(this._model.tabs).map((t) => t.id),
      tabLabels: Object.fromEntries(list(this._model.tabs).map((t) => [t.id, t.header])),
      groupOrder: Object.fromEntries(
        list(this._model.tabs).map((t) => [t.id, list(t.groups).map((g) => g.id)]),
      ),
    };
  }
  importCustomization(data) {
    if (!data || data.version !== 1) throw new Error('Unsupported ribbon customization version');
    const ids = new Set(list(this._model.tabs).map((t) => t.id));
    this._hiddenTabs = new Set(list(data.hiddenTabs).filter((id) => ids.has(id)));
    this._hiddenGroups = new Set(list(data.hiddenGroups));
    this._qatIds = Array.isArray(data.quickAccessToolbar)
      ? data.quickAccessToolbar.filter((id) => this.getControl(id))
      : null;
    const order = list(data.tabOrder);
    this._model.tabs.sort(
      (a, b) =>
        (order.includes(a.id) ? order.indexOf(a.id) : 999) -
        (order.includes(b.id) ? order.indexOf(b.id) : 999),
    );
    for (const t of this._model.tabs) {
      if (typeof data.tabLabels?.[t.id] === 'string') t.header = data.tabLabels[t.id];
      const go = list(data.groupOrder?.[t.id]);
      t.groups.sort(
        (a, b) =>
          (go.includes(a.id) ? go.indexOf(a.id) : 999) -
          (go.includes(b.id) ? go.indexOf(b.id) : 999),
      );
    }
    if (['classic', 'simplified'].includes(data.layout)) this.layout = data.layout;
    if (['light', 'dark', 'system'].includes(data.theme)) this.theme = data.theme;
    this.minimized = !!data.minimized;
    if (ids.has(data.selectedTab)) this._selected = data.selectedTab;
    this.requestRender();
  }
  saveCustomization() {
    const data = this.exportCustomization();
    const key = this.getAttribute('storage-key') || this._model.storageKey;
    try {
      if (key) localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      this._emit('ribbon-storage-error', { error });
    }
    this._emit('ribbon-customization-change', data);
    return data;
  }
  loadCustomization() {
    const key = this.getAttribute('storage-key') || this._model.storageKey;
    try {
      if (key) {
        const text = localStorage.getItem(key);
        if (text) this.importCustomization(JSON.parse(text));
      }
    } catch (error) {
      this._emit('ribbon-storage-error', { error });
    }
  }
  resetCustomization() {
    this.importCustomization(this._defaults);
    this.saveCustomization();
    this.requestRender();
  }
  openCustomization(draft = null) {
    draft ||= this.exportCustomization();
    const anchor = this.shadowRoot.querySelector('.tabs-row');
    const popup = this._newPopup(anchor, 'customizer');
    prop(popup, 'role', 'dialog');
    prop(popup, 'aria-label', 'Customize ribbon');
    popup.append(el('h3', '', 'Customize ribbon'));
    for (const [index, t] of list(this._model.tabs)
      .sort((a, b) => draft.tabOrder.indexOf(a.id) - draft.tabOrder.indexOf(b.id))
      .entries()) {
      const row = el('div', 'row');
      const show = el('input');
      show.type = 'checkbox';
      show.checked = !draft.hiddenTabs.includes(t.id);
      prop(show, 'aria-label', `Show ${t.header}`);
      show.addEventListener('change', () => {
        draft.hiddenTabs = show.checked
          ? draft.hiddenTabs.filter((id) => id !== t.id)
          : [...draft.hiddenTabs, t.id];
      });
      const name = el('input');
      name.type = 'text';
      name.value = draft.tabLabels[t.id] || t.header;
      prop(name, 'aria-label', `Rename ${t.header}`);
      name.addEventListener('input', () => (draft.tabLabels[t.id] = name.value));
      row.append(
        show,
        name,
        this._button(
          '↑',
          () => {
            if (index > 0) {
              const tabs = draft.tabOrder;
              [tabs[index - 1], tabs[index]] = [tabs[index], tabs[index - 1]];
              this.openCustomization(draft);
            }
          },
          { title: `Move ${t.header} left`, disabled: index === 0 },
        ),
        this._button(
          '↓',
          () => {
            const tabs = draft.tabOrder;
            if (index < tabs.length - 1) {
              [tabs[index + 1], tabs[index]] = [tabs[index], tabs[index + 1]];
              this.openCustomization(draft);
            }
          },
          { title: `Move ${t.header} right`, disabled: index === this._model.tabs.length - 1 },
        ),
      );
      popup.append(row);
      for (const [gi, g] of list(t.groups)
        .sort((a, b) => draft.groupOrder[t.id].indexOf(a.id) - draft.groupOrder[t.id].indexOf(b.id))
        .entries()) {
        const gr = el('div', 'row');
        gr.style.paddingInlineStart = '30px';
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = !draft.hiddenGroups.includes(g.id);
        prop(cb, 'aria-label', `Show ${g.header} group`);
        cb.addEventListener('change', () => {
          draft.hiddenGroups = cb.checked
            ? draft.hiddenGroups.filter((id) => id !== g.id)
            : [...draft.hiddenGroups, g.id];
        });
        gr.append(
          cb,
          el('span', '', g.header),
          this._button(
            '↑',
            () => {
              if (gi > 0) {
                const ids = draft.groupOrder[t.id];
                [ids[gi - 1], ids[gi]] = [ids[gi], ids[gi - 1]];
                this.openCustomization(draft);
              }
            },
            { title: `Move ${g.header} group left`, disabled: gi === 0 },
          ),
        );
        popup.append(gr);
      }
    }
    const footer = el('div', 'footer');
    footer.append(
      this._button(
        'Apply',
        () => {
          this.importCustomization(draft);
          this.saveCustomization();
          this.requestRender();
        },
        { cls: 'primary' },
      ),
      this._button('Reset', () => this.resetCustomization()),
      this._button('Close', () => this.closePopup()),
    );
    popup.append(footer);
    this._positionPopup(anchor);
    popup.querySelector('input')?.focus();
  }
  addTab(tab, index = this._model.tabs.length) {
    const normalized = normalizeRibbon({ tabs: [tab] }).tabs[0];
    if (this._model.tabs.some((t) => t.id === normalized.id))
      throw new Error(`Duplicate tab: ${normalized.id}`);
    this._model.tabs.splice(Math.max(0, index), 0, normalized);
    this.invalidate();
    return normalized;
  }
  removeTab(id) {
    const i = this._model.tabs.findIndex((t) => t.id === id);
    if (i < 0) return false;
    this._model.tabs.splice(i, 1);
    this.invalidate();
    return true;
  }
  addGroup(tabId, group, index) {
    const tab = this._model.tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error(`Unknown tab: ${tabId}`);
    const normalized = normalizeRibbon({ tabs: [{ groups: [group] }] }).tabs[0].groups[0];
    if (tab.groups.some((g) => g.id === normalized.id))
      throw new Error(`Duplicate group: ${normalized.id}`);
    tab.groups.splice(index ?? tab.groups.length, 0, normalized);
    this.invalidate();
    return normalized;
  }
  addControl(groupId, control, index) {
    const group = this._model.tabs.flatMap((t) => t.groups).find((g) => g.id === groupId);
    if (!group) throw new Error(`Unknown group: ${groupId}`);
    const normalized = normalizeRibbon({ tabs: [{ groups: [{ items: [control] }] }] }).tabs[0]
      .groups[0].items[0];
    if (this.getControl(normalized.id)) throw new Error(`Duplicate control: ${normalized.id}`);
    group.items.splice(index ?? group.items.length, 0, normalized);
    this.invalidate();
    return normalized;
  }
  removeControl(id) {
    for (const tab of this._model.tabs)
      for (const group of tab.groups) {
        const i = group.items.findIndex((c) => c.id === id);
        if (i >= 0) {
          group.items.splice(i, 1);
          this.removeFromQuickAccess(id);
          this.invalidate();
          return true;
        }
      }
    return false;
  }
  setQuickAccess(ids) {
    this._qatIds = [...new Set(ids)].filter((id) => this.getControl(id));
    this.saveCustomization();
    this.requestRender();
  }
  addToQuickAccess(id) {
    this.setQuickAccess([
      ...(this._qatIds || list(this._model.quickAccessToolbar).map((c) => c.id)),
      id,
    ]);
  }
  removeFromQuickAccess(id) {
    this.setQuickAccess(
      (this._qatIds || list(this._model.quickAccessToolbar).map((c) => c.id)).filter(
        (value) => value !== id,
      ),
    );
  }
  moveQuickAccess(id, index) {
    const ids = this._qatIds || list(this._model.quickAccessToolbar).map((c) => c.id);
    const old = ids.indexOf(id);
    if (old < 0) return false;
    const next = ids.filter((value) => value !== id);
    next.splice(Math.max(0, index), 0, id);
    this.setQuickAccess(next);
    return true;
  }
  AddTab(tab, index) {
    return this.addTab(tab, index);
  }
  RemoveTab(id) {
    return this.removeTab(id);
  }
  AddGroup(tab, group, index) {
    return this.addGroup(tab, group, index);
  }
  AddControl(group, control, index) {
    return this.addControl(group, control, index);
  }
  RemoveControl(id) {
    return this.removeControl(id);
  }
  _keyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this._popup) this.closePopup();
      else if (this._backstage) this.closeBackstage();
      else if (this._peek) {
        this._peek = false;
        this.requestRender();
      }
      this._setKeyTips(null);
      return;
    }
    const target = e.composedPath()[0];
    if (target.matches?.('[role=tab]')) {
      const tabs = [...this.shadowRoot.querySelectorAll('[role=tab]')];
      let i = tabs.indexOf(target);
      const rtl = this.getAttribute('dir') === 'rtl';
      if (e.key === 'ArrowRight') i += rtl ? -1 : 1;
      else if (e.key === 'ArrowLeft') i += rtl ? 1 : -1;
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = tabs.length - 1;
      else return;
      e.preventDefault();
      const next = tabs[(i + tabs.length) % tabs.length];
      this.selectTab(next.dataset.tabId);
      queueMicrotask(() => this.shadowRoot.getElementById(next.id)?.focus());
      return;
    }
    if (target.matches?.('input,select,textarea')) return;
    const container = this._popup || target.closest?.('.group-items,.qat');
    if (!container) return;
    const nodes = [
      ...container.querySelectorAll(
        'button:not(:disabled),input:not(:disabled),select:not(:disabled)',
      ),
    ].filter((n) => n.getClientRects().length);
    let i = nodes.indexOf(target);
    if (['ArrowDown', 'ArrowRight'].includes(e.key)) i++;
    else if (['ArrowUp', 'ArrowLeft'].includes(e.key)) i--;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = nodes.length - 1;
    else return;
    if (nodes.length) {
      e.preventDefault();
      nodes[(i + nodes.length) % nodes.length].focus();
    }
  }
  _documentKey(e) {
    if (!this.isConnected || this.hidden || this.getClientRects().length === 0) return;
    const owner = e.composedPath().find((n) => n instanceof RibbonElement);
    const first = [...document.querySelectorAll('ribbon-web')].find(
      (n) => n.getClientRects().length,
    );
    if (owner ? owner !== this : first !== this) return;
    const edit = e.composedPath()[0]?.matches?.('input,textarea,[contenteditable=true]');
    if (e.key === 'F1' && e.ctrlKey) {
      e.preventDefault();
      this.minimized = !this.minimized;
      return;
    }
    if (e.altKey && e.key.toLowerCase() === 'q') {
      e.preventDefault();
      this.openSearch();
      return;
    }
    if ((e.key === 'Alt' && !e.ctrlKey) || e.key === 'F10') {
      e.preventDefault();
      this._setKeyTips(this._keyScope ? null : 'tabs');
      return;
    }
    if (this._keyScope) {
      if (e.key === 'Escape') {
        this._setKeyTips(null);
        return;
      }
      if (/^[a-z0-9]$/i.test(e.key)) {
        e.preventDefault();
        this._keyBuffer += e.key.toUpperCase();
        const scope =
          this._keyScope === 'tabs'
            ? '.tabs-row [data-key-tip],.qat [data-key-tip]'
            : '.panel [data-key-tip]';
        const nodes = [...this.shadowRoot.querySelectorAll(scope)].filter(
          (n) => n.getClientRects().length && !n.disabled,
        );
        const node = nodes.find((n) => n.dataset.keyTip.toUpperCase() === this._keyBuffer);
        if (node) {
          const isTab = node.getAttribute('role') === 'tab';
          if (node.matches('input,select')) node.focus();
          else node.click();
          this._setKeyTips(isTab ? 'controls' : null);
          queueMicrotask(() => this._paintKeyTips());
        } else if (!nodes.some((n) => n.dataset.keyTip.toUpperCase().startsWith(this._keyBuffer)))
          this._keyBuffer = '';
        return;
      }
    }
    for (const c of this._allControls()) {
      if (!c.shortcut) continue;
      const keys = c.shortcut.toLowerCase().split('+');
      const key = keys.pop();
      if (
        e.key.toLowerCase() === key &&
        e.ctrlKey === keys.includes('ctrl') &&
        e.metaKey === keys.includes('meta') &&
        e.altKey === keys.includes('alt') &&
        e.shiftKey === keys.includes('shift') &&
        (!edit || c.allowInInput)
      ) {
        e.preventDefault();
        this.execute(c);
        break;
      }
    }
  }
  _setKeyTips(scope) {
    this._keyScope = scope;
    this._keyBuffer = '';
    this._paintKeyTips();
  }
  _paintKeyTips() {
    this.shadowRoot.querySelectorAll('.key-tip').forEach((n) => n.remove());
    if (!this._keyScope) return;
    const selector =
      this._keyScope === 'tabs'
        ? '.tabs-row [data-key-tip],.qat [data-key-tip]'
        : '.panel [data-key-tip]';
    this.shadowRoot.querySelectorAll(selector).forEach((n) => {
      if (n.getClientRects().length && !n.disabled) {
        const tip = el('span', 'key-tip', n.dataset.keyTip);
        (n.matches('input,select') ? n.parentElement : n).append(tip);
      }
    });
  }
  _showTooltip(e) {
    const node = e.composedPath().find((n) => n?.dataset?.tooltip);
    if (!node || this._popup || this._keyScope) return;
    this._hideTooltip();
    this._tooltipTimer = setTimeout(() => {
      const tip = el('div', 'tooltip');
      tip.setAttribute('role', 'tooltip');
      tip.append(
        el(
          'strong',
          '',
          node.dataset.tooltip + (node.dataset.shortcut ? ` (${node.dataset.shortcut})` : ''),
        ),
      );
      if (node.dataset.description) tip.append(el('p', '', node.dataset.description));
      const r = node.getBoundingClientRect();
      tip.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 290))}px`;
      tip.style.top = `${r.bottom + 9}px`;
      this.shadowRoot.append(tip);
      this._tooltip = tip;
    }, 650);
  }
  _hideTooltip() {
    clearTimeout(this._tooltipTimer);
    this._tooltip?.remove();
    this._tooltip = null;
  }
}
export function registerRibbon(tagName = 'ribbon-web') {
  if (!globalThis.customElements) return;
  if (!customElements.get(tagName))
    customElements.define(
      tagName,
      tagName === 'ribbon-web' ? RibbonElement : class extends RibbonElement {},
    );
  return customElements.get(tagName);
}
registerRibbon();
