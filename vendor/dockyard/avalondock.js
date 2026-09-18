/* AvalonDock Web 0.1.0 — original JavaScript implementation, MIT. */
(function(global){'use strict';
const __base=typeof document!=='undefined'?(document.currentScript?.src||location.href):'file:///avalondock.js';
const __modules={"index.js":function(__exports,__require){
Object.assign(__exports,__require("events.js"));
Object.assign(__exports,__require("model.js"));
Object.assign(__exports,__require("manager.js"));
Object.assign(__exports,__require("serialization.js"));
Object.assign(__exports,__require("items.js"));
Object.assign(__exports,__require("controls.js"));
Object.assign(__exports,__require("themes.js"));
Object.assign(__exports,__require("web-component.js"));
const Models=__require("model.js");
const Serialization=__require("serialization.js");
const Controls=__require("controls.js");
const Themes=__require("themes.js");
const Events=__require("events.js");
const Items=__require("items.js");
const { DockingManager }=__require("manager.js");
const { AvalonDockElement, registerAvalonDock }=__require("web-component.js");

const Layout = Object.freeze({ ...Models, Serialization });
const Commands = Object.freeze({ RelayCommand: Events.RelayCommand });
const version = '0.1.0';
const AvalonDock = Object.freeze({ ...Models, ...Serialization, ...Themes, ...Controls, ...Events, ...Items, DockingManager, AvalonDockElement, registerAvalonDock, Layout, Controls, Themes, Serialization, Commands, version });
__exports.default=AvalonDock;

__exports.Layout=Layout;
__exports.Commands=Commands;
__exports.version=version;
__exports.AvalonDock=AvalonDock;
__exports.Controls=Controls;
__exports.Themes=Themes;
__exports.Serialization=Serialization;
},
"model.js":function(__exports,__require){
const { ObservableObject, ObservableCollection, EventSignal, CancelEventArgs, properties, getSchema, GridLength, finite, positive, boolean, uid }=__require("events.js");
__exports.ObservableCollection=__require("events.js").ObservableCollection;
__exports.GridLength=__require("events.js").GridLength;
const AnchorSide = Object.freeze({ Left: 'Left', Top: 'Top', Right: 'Right', Bottom: 'Bottom' });
const AnchorableShowStrategy = Object.freeze({ Most: 1, Left: 2, Right: 4, Top: 16, Bottom: 32 });

class LayoutElement extends ObservableObject {
  constructor() { super(); this._values.Id = uid(); this._parent = null; }
  get Parent() { return this._parent; }
  get Root() {
    let node = this;
    while (node && !(node instanceof LayoutRoot)) node = node.Parent;
    return node || null;
  }
  get Manager() { return this.Root?._manager || null; }
  get Children() { return []; }
  get ChildrenCount() { return this.Children.length; }
  *Descendents() { for (const child of this.Children) { yield child; yield* child.Descendents(); } }
  *Descendants() { yield* this.Descendents(); }
  FindParent(type) {
    let node = this.Parent;
    while (node) { if (typeof type === 'string' ? node.constructor.name === type : node instanceof type) return node; node = node.Parent; }
    return null;
  }
  FindRoot() { return this.Root; }
  _validateProperty(name, value) {
    if (!this.Root || !['Id','ContentId'].includes(name) || value == null) return;
    const all = [this.Root, ...this.Root.Descendents()];
    if (all.some(node => node !== this && node[name] === value)) throw new Error(`Duplicate ${name}: ${value}`);
  }
  _willChange(name) { this.Manager?._modelWillChange(this, name); }
  _didChange(name, args) { this.Manager?._modelDidChange(this, name, args); }
  _collectionChanged(role, args) {
    const root = this.Root;
    for (const node of args.OldItems) if (args.Action !== 'Move') root?.ElementRemoved.emit(root, { Element: node });
    for (const node of args.NewItems) if (args.Action !== 'Move') root?.ElementAdded.emit(root, { Element: node });
    this.ChildrenCollectionChanged?.emit(this, args);
    this.ChildrenTreeChanged?.emit(this, { Change: args, TreeChange: args.Action });
    this._didChange(role, args);
  }
  _validateChild(item) {
    if (!(item instanceof LayoutElement)) throw new TypeError('Layout children must be LayoutElement instances');
    for (let node = this; node; node = node.Parent) if (node === item) throw new Error('Layout cycles are not allowed');
    const targetManager = this.Manager, sourceManager = item.Manager;
    if (targetManager && sourceManager && targetManager !== sourceManager) throw new Error('Use TransferTo() to move content between managers');
    const root = this.Root;
    if (root && item.Root !== root) {
      const incoming = [item, ...item.Descendents()], existing = [root, ...root.Descendents()];
      const ids = new Set(existing.map(node => node.Id)), contentIds = new Set(existing.filter(node => node instanceof LayoutContent).map(node => node.ContentId).filter(id => id != null));
      for (const node of incoming) {
        if (ids.has(node.Id)) throw new Error(`Duplicate Id: ${node.Id}`); ids.add(node.Id);
        if (node instanceof LayoutContent && node.ContentId != null) { if (contentIds.has(node.ContentId)) throw new Error(`Duplicate ContentId: ${node.ContentId}`); contentIds.add(node.ContentId); }
      }
    }
  }
  _init(options = {}) {
    if (options instanceof LayoutElement) options = { Children: [options] };
    if (Array.isArray(options)) options = { Children: options };
    if (!options || typeof options !== 'object') throw new TypeError('Layout options must be an object');
    const late = [];
    for (const [key, value] of Object.entries(options)) {
      if (key.startsWith('_') || ['__proto__', 'prototype', 'constructor', 'Parent', 'Manager', 'Root'].includes(key)) throw new Error(`Invalid option ${key}`);
      if (['Children', 'FloatingWindows', 'Hidden'].includes(key)) { this[key].AddRange(value); }
      else if (key === 'IsActive' || key === 'IsSelected' || key === 'SelectedContentIndex') late.push([key, value]);
      else this[key] = value;
    }
    for (const [key, value] of late) this[key] = value;
    return this;
  }
  toString() { return `${this.constructor.name}(${this.Title || this.Id})`; }
}

properties(LayoutElement, { Id: { default: null, coerce: value => String(value), validate: value => value.length > 0 && value.length <= 512 } });

class LayoutGroupBase extends LayoutElement {
  constructor() {
    super(); this._children = new ObservableCollection([], this);
    this.ChildrenCollectionChanged = new EventSignal(); this.ChildrenTreeChanged = new EventSignal();
  }
  get Children() { return this._children; }
  get ChildrenCount() { return this.Children.Count; }
  IndexOf(item) { return this.Children.IndexOf(item); }
  InsertChildAt(index, item) { this.Children.Insert(index, item); }
  RemoveChild(item) { return this.Children.Remove(item); }
  RemoveChildAt(index) { return this.Children.RemoveAt(index); }
  ReplaceChild(old, replacement) { const i = this.Children.IndexOf(old); if (i < 0) throw new Error('Child not found'); this.Children.Set(i, replacement); }
  MoveChild(oldIndex, newIndex) { this.Children.Move(oldIndex, newIndex); }
  get IsVisible() { return this.Children.some(x => x.IsVisible); }
  ComputeVisibility() { return this.IsVisible; }
}
class LayoutGroup extends LayoutGroupBase {}
class LayoutPositionableGroup extends LayoutGroup {}
properties(LayoutPositionableGroup, {
  DockWidth: { default: '1*', coerce: GridLength.Parse }, DockHeight: { default: '1*', coerce: GridLength.Parse },
  DockMinWidth: { default: 80, coerce: positive }, DockMinHeight: { default: 48, coerce: positive },
  DockMaxWidth: { default: 1000000, coerce: positive }, DockMaxHeight: { default: 1000000, coerce: positive },
  FloatingLeft: { default: 60, coerce: finite }, FloatingTop: { default: 60, coerce: finite },
  FloatingWidth: { default: 480, coerce: positive }, FloatingHeight: { default: 320, coerce: positive },
  IsMaximized: { default: false, coerce: boolean },
  ActualWidth: { default: 0, coerce: positive, serialize: false }, ActualHeight: { default: 0, coerce: positive, serialize: false },
  ResizableAbsoluteDockWidth: { default: true, coerce: boolean }, ResizableAbsoluteDockHeight: { default: true, coerce: boolean }
});
class LayoutPanel extends LayoutPositionableGroup {
  constructor(options = {}) { super(); this._init(options); }
  _validateChild(item) {
    super._validateChild(item);
    if (!(item instanceof LayoutPositionableGroup)) throw new TypeError('A LayoutPanel accepts panes and pane groups, not content');
  }
}
properties(LayoutPanel, { Orientation: { default: 'Horizontal', validate: x => ['Horizontal', 'Vertical'].includes(x) } });
class LayoutAnchorablePaneGroup extends LayoutPositionableGroup {
  constructor(options = {}) { super(); this._init(options); }
  _validateChild(item) {
    super._validateChild(item);
    if (!(item instanceof LayoutAnchorablePane || item instanceof LayoutAnchorablePaneGroup)) throw new TypeError('Anchorable groups accept anchorable panes/groups');
  }
}
properties(LayoutAnchorablePaneGroup, { Orientation: { default: 'Horizontal', validate: x => ['Horizontal', 'Vertical'].includes(x) } });
class LayoutDocumentPaneGroup extends LayoutPositionableGroup {
  constructor(options = {}) { super(); this._init(options); }
  _validateChild(item) {
    super._validateChild(item);
    if (!(item instanceof LayoutDocumentPane || item instanceof LayoutDocumentPaneGroup)) throw new TypeError('Document groups accept document panes/groups');
  }
}
properties(LayoutDocumentPaneGroup, { Orientation: { default: 'Horizontal', validate: x => ['Horizontal', 'Vertical'].includes(x) } });

class LayoutContent extends LayoutElement {
  constructor() {
    super();
    for (const name of ['IsSelectedChanged', 'IsActiveChanged', 'Closing', 'Closed']) this[name] = new EventSignal();
    this._selected = false; this._active = false;
    this._previous = null; this._previousId = null; this._return = null;
  }
  get IsSelected() { return this._selected; }
  set IsSelected(value) {
    value = boolean(value);
    if (this._selected === value) return;
    if (this.Parent instanceof LayoutPane) {
      if (value) this.Parent.SelectedContentIndex = this.Parent.IndexOf(this);
      else if (this.Parent.SelectedContent === this) this.Parent.SelectedContentIndex = -1;
    } else this._setSelected(value);
  }
  _setSelected(value) {
    if (value === this._selected) return;
    this._selected = value;
    this.IsSelectedChanged.emit(this, {});
    this.PropertyChanged.emit(this, { PropertyName: 'IsSelected', NewValue: value });
    this._didChange('IsSelected');
  }
  get IsActive() { return this._active; }
  set IsActive(value) {
    value = boolean(value);
    if (value === this._active) return;
    if (this.Manager) { if (value) this.Manager.Activate(this); else if (this.Root.ActiveContent === this) this.Manager.Activate(null); }
    else this._setActive(value);
  }
  _setActive(value) {
    if (this._active === value) return;
    this._active = value;
    if (value) { this.IsSelected = true; this._values.LastActivationTimeStamp = new Date().toISOString(); }
    this.IsActiveChanged.emit(this, {});
    this.PropertyChanged.emit(this, { PropertyName: 'IsActive', NewValue: value });
  }
  get IsFloating() { return !!this.FindParent(LayoutFloatingWindow); }
  get IsLastFocusedDocument() { return this.Root?.LastFocusedDocument === this; }
  get IsVisible() { return !!this.Parent && !(this.Parent instanceof LayoutRoot && this.Parent.Hidden.Contains(this)); }
  get PreviousContainer() { return this._previous; }
  set PreviousContainer(value) { this._previous = value; this._previousId = value?.Id || null; }
  get PreviousContainerId() { return this._previous?.Id || this._previousId; }
  set PreviousContainerId(value) { this._previousId = value; }
  get IsDocked() { return this.IsVisible && !this.IsFloating && !this.IsAutoHidden; }
  get IsAutoHidden() { return false; }
  Activate() { if (this.Manager) this.Manager.Activate(this); else this._setActive(true); return this; }
  Float() { return this.Manager ? this.Manager.Float(this) : false; }
  Dock() { return this.Manager ? this.Manager.Dock(this) : false; }
  DockAsDocument() { return this.Manager ? this.Manager.DockAsDocument(this) : false; }
  Close() {
    if (this.Manager) return this.Manager.Close(this);
    if (!this.CanClose) return false;
    const args = new CancelEventArgs(); this.Closing.emit(this, args);
    if (args.Cancel) return false;
    this.Parent?.RemoveChild(this); this.Closed.emit(this, {}); return true;
  }
}
properties(LayoutContent, {
  Title: { default: '', coerce: x => String(x ?? '') },
  ContentId: { default: null, coerce: x => x == null ? null : String(x) },
  Content: { default: null, serialize: false },
  IconSource: { default: null }, ToolTip: { default: null }, Description: { default: '' },
  CanClose: { default: true, coerce: boolean }, CanFloat: { default: true, coerce: boolean },
  CanMove: { default: true, coerce: boolean }, CanDock: { default: true, coerce: boolean },
  IsEnabled: { default: true, coerce: boolean }, IsModified: { default: false, coerce: boolean },
  IsPinned: { default: false, coerce: boolean },
  FloatingLeft: { default: 60, coerce: finite }, FloatingTop: { default: 60, coerce: finite },
  FloatingWidth: { default: 480, coerce: positive }, FloatingHeight: { default: 320, coerce: positive },
  IsMaximized: { default: false, coerce: boolean },
  PreviousContainerIndex: { default: -1, coerce: finite },
  LastActivationTimeStamp: { default: null },
  UserData: { default: null }
});
class LayoutDocument extends LayoutContent {
  constructor(options = {}) { super(); this._init(options); }
}
class LayoutAnchorable extends LayoutContent {
  constructor(options = {}) {
    super();
    this.Hiding = new EventSignal(); this.IsVisibleChanged = new EventSignal(); this.IsAutoHiddenChanged = new EventSignal();
    this._init(options);
  }
  get IsAutoHidden() { return this.Parent instanceof LayoutAnchorGroup; }
  get IsHidden() { return !!this.Root?.Hidden.Contains(this); }
  get IsVisible() { return super.IsVisible; }
  set IsVisible(value) { if (value) this.Show(); else this.Hide(); }
  Hide(cancelable = true) { return this.Manager ? this.Manager.Hide(this, cancelable) : false; }
  Show() { return this.Manager ? this.Manager.Show(this) : false; }
  ToggleAutoHide() { return this.Manager ? this.Manager.ToggleAutoHide(this) : false; }
  AddToLayout(manager, strategy = AnchorableShowStrategy.Most) { return manager.AddAnchorable(this, strategy); }
}
properties(LayoutAnchorable, {
  CanHide: { default: true, coerce: boolean }, CanAutoHide: { default: true, coerce: boolean },
  CanDockAsTabbedDocument: { default: true, coerce: boolean },
  AutoHideWidth: { default: 280, coerce: positive }, AutoHideHeight: { default: 220, coerce: positive },
  AutoHideMinWidth: { default: 100, coerce: positive }, AutoHideMinHeight: { default: 80, coerce: positive }
});

class LayoutPane extends LayoutPositionableGroup {
  constructor() { super(); this._selectedIndex = -1; }
  get SelectedContentIndex() { return this._selectedIndex; }
  set SelectedContentIndex(value) {
    value = Number(value);
    if (!Number.isInteger(value) || value < -1 || value >= this.Children.Count) throw new RangeError('SelectedContentIndex out of range');
    if (value === this._selectedIndex && this.Children.every((c, i) => c.IsSelected === (i === value))) return;
    this._selectedIndex = value;
    this.Children.forEach((c, i) => c._setSelected(i === value));
    this.PropertyChanged.emit(this, { PropertyName: 'SelectedContentIndex', NewValue: value });
    this._didChange('SelectedContentIndex');
  }
  get SelectedContent() { return this.Children[this.SelectedContentIndex] || null; }
  get IsActive() { return this.Children.some(x => x.IsActive); }
  get CanClose() { return this.Children.every(x => x.CanClose); }
  get CanHide() { return this.Children.every(x => x.CanHide); }
  get CanAutoHide() { return this.Children.every(x => x.CanAutoHide); }
  get IsDirectlyHostedInFloatingWindow() { return this.Parent instanceof LayoutFloatingWindow || (this.Parent?.Parent instanceof LayoutFloatingWindow && this.Parent.ChildrenCount === 1); }
  _collectionChanged(role, args) {
    if (role === 'Children') {
      let selected = this.Children.findIndex(x => x.IsSelected);
      if (selected < 0 && this.Children.Count) selected = Math.max(0, Math.min(this._selectedIndex, this.Children.Count - 1));
      this._selectedIndex = -2;
      this.SelectedContentIndex = selected;
    }
    super._collectionChanged(role, args);
  }
  SetNextSelectedIndex() { if (this.Children.Count) this.SelectedContentIndex = (this.SelectedContentIndex + 1) % this.Children.Count; }
}
properties(LayoutPane, {
  CanRepositionItems: { default: true, coerce: boolean }, ShowHeader: { default: true, coerce: boolean }, Name: { default: '' }
});
class LayoutDocumentPane extends LayoutPane {
  constructor(options = {}) { super(); this._init(options); }
  _validateChild(item) { super._validateChild(item); if (!(item instanceof LayoutContent)) throw new TypeError('Document panes accept documents or anchorables'); }
  get IsVisible() { return true; }
}
class LayoutAnchorablePane extends LayoutPane {
  constructor(options = {}) { super(); this._init(options); }
  _validateChild(item) { super._validateChild(item); if (!(item instanceof LayoutAnchorable)) throw new TypeError('Anchorable panes accept only anchorables'); }
}
class LayoutAnchorGroup extends LayoutGroup {
  constructor(options = {}) { super(); this.PreviousContainer = null; this.PreviousContainerId = null; this._init(options); }
  _validateChild(item) { super._validateChild(item); if (!(item instanceof LayoutAnchorable)) throw new TypeError('Auto-hide groups accept only anchorables'); }
}
class LayoutAnchorSide extends LayoutGroup {
  constructor(options = {}) { super(); this._init(options); }
  _validateChild(item) { super._validateChild(item); if (!(item instanceof LayoutAnchorGroup)) throw new TypeError('Sides accept LayoutAnchorGroup children'); }
}
properties(LayoutAnchorSide, { Side: { default: 'Left', validate: x => Object.hasOwn(AnchorSide, x) } });

class LayoutFloatingWindow extends LayoutGroup {
  get IsValid() { return this.ChildrenCount > 0; }
  get IsVisible() { return this.IsValid; }
  get IsSinglePane() { return [...this.Descendents()].filter(x => x instanceof LayoutPane).length === 1; }
  get SinglePane() { return this.IsSinglePane ? [...this.Descendents()].find(x => x instanceof LayoutPane) : null; }
  get RootPanel() { return this.Children[0] || null; }
  set RootPanel(value) { if (this.RootPanel === value) return; if (value) { if (this.ChildrenCount) this.Children.Set(0, value); else this.Children.Add(value); } else this.Children.Clear(); }
}
properties(LayoutFloatingWindow, {
  FloatingLeft: { default: 60, coerce: finite }, FloatingTop: { default: 60, coerce: finite },
  FloatingWidth: { default: 480, coerce: positive }, FloatingHeight: { default: 320, coerce: positive },
  IsMaximized: { default: false, coerce: boolean }, ZIndex: { default: 1, coerce: finite }
});
class LayoutAnchorableFloatingWindow extends LayoutFloatingWindow {
  constructor(options = {}) { super(); this._init(options); }
  _validateChild(item, role, replacing = false) {
    super._validateChild(item);
    if (!(item instanceof LayoutAnchorablePaneGroup || item instanceof LayoutAnchorablePane)) throw new TypeError('Anchorable floating windows accept anchorable pane groups');
    if (!replacing && this.ChildrenCount && !this.Children.Contains(item)) throw new Error('A floating window has only one root');
  }
}
class LayoutDocumentFloatingWindow extends LayoutFloatingWindow {
  constructor(options = {}) { super(); this._init(options); }
  get RootDocument() {
    const root = this.Children[0];
    return root instanceof LayoutDocument ? root : [...this.Descendents()].find(x => x instanceof LayoutDocument) || null;
  }
  set RootDocument(value) {
    if (value != null && !(value instanceof LayoutDocument)) throw new TypeError('RootDocument must be a LayoutDocument');
    this.RootPanel = value;
  }
  _validateChild(item, role, replacing = false) {
    super._validateChild(item);
    if (!(item instanceof LayoutDocument || item instanceof LayoutDocumentPane || item instanceof LayoutDocumentPaneGroup)) throw new TypeError('Document floating windows accept document content/panes');
    if (!replacing && this.ChildrenCount && !this.Children.Contains(item)) throw new Error('A floating window has only one root');
  }
}

class LayoutRoot extends LayoutElement {
  constructor(options = {}) {
    super(); this._manager = null;
    this.Updated = new EventSignal(); this.ElementAdded = new EventSignal(); this.ElementRemoved = new EventSignal();
    this._rootPanel = null; this._sides = Object.create(null);
    this.FloatingWindows = new ObservableCollection([], this, 'FloatingWindows');
    this.Hidden = new ObservableCollection([], this, 'Hidden');
    this._activeContent = null; this._lastFocusedDocument = null;
    this.RootPanel = new LayoutPanel();
    for (const side of Object.keys(AnchorSide)) this[`${side}Side`] = new LayoutAnchorSide({ Side: side });
    this._init(options instanceof LayoutPanel ? { RootPanel: options } : options);
  }
  get RootPanel() { return this._rootPanel; }
  set RootPanel(value) {
    if (!(value instanceof LayoutPanel)) throw new TypeError('RootPanel must be a LayoutPanel');
    if (value === this._rootPanel) return;
    this._validateChild(value, 'RootPanel'); this._willChange('RootPanel');
    value.Parent?.RemoveChild(value);
    if (this._rootPanel) this._rootPanel._parent = null;
    this._rootPanel = value; value._parent = this; this._didChange('RootPanel');
  }
  get Children() { return [this.RootPanel, ...Object.values(this._sides), ...this.FloatingWindows, ...this.Hidden].filter(Boolean); }
  get ActiveContent() { return this._activeContent; }
  set ActiveContent(value) {
    if (this._manager) this._manager.Activate(value);
    else { this._activeContent?._setActive(false); this._activeContent = value; value?._setActive(true); }
  }
  get LastFocusedDocument() { return this._lastFocusedDocument; }
  get IsVisible() { return true; }
  RemoveChild(item) {
    if (this.FloatingWindows.Contains(item)) return this.FloatingWindows.Remove(item);
    if (this.Hidden.Contains(item)) return this.Hidden.Remove(item);
    if (this.RootPanel === item) { this.RootPanel = new LayoutPanel(); return true; }
    for (const side of Object.keys(AnchorSide)) if (this[`${side}Side`] === item) { this[`${side}Side`] = new LayoutAnchorSide({ Side: side }); return true; }
    return false;
  }
  ReplaceChild(old, replacement) {
    if (old === this.RootPanel) { this.RootPanel = replacement; return; }
    for (const collection of [this.FloatingWindows, this.Hidden]) {
      const index = collection.IndexOf(old); if (index !== -1) { collection.Set(index, replacement); return; }
    }
    throw new Error('Root child not found');
  }
  _validateChild(item, role) {
    super._validateChild(item);
    if (role === 'FloatingWindows' && !(item instanceof LayoutFloatingWindow)) throw new TypeError('FloatingWindows accepts floating window models');
    if (role === 'Hidden' && !(item instanceof LayoutAnchorable)) throw new TypeError('Only anchorables can be hidden');
  }
  CollectGarbage() {
    const protectedIds = new Set([...this.Descendents()].filter(x => x instanceof LayoutContent).map(x => x.PreviousContainerId).filter(Boolean));
    const prune = node => {
      for (const child of [...node.Children]) prune(child);
      if (node instanceof LayoutFloatingWindow && ![...node.Descendents()].some(x => x instanceof LayoutContent)) this.FloatingWindows.Remove(node);
      if ((node instanceof LayoutAnchorGroup || node instanceof LayoutAnchorablePane || node instanceof LayoutAnchorablePaneGroup) && !node.ChildrenCount && !protectedIds.has(node.Id)) node.Parent?.RemoveChild(node);
      if (node instanceof LayoutDocumentPaneGroup && !node.ChildrenCount) node.Parent?.RemoveChild(node);
    };
    prune(this);
  }
}
for (const side of Object.keys(AnchorSide)) Object.defineProperty(LayoutRoot.prototype, `${side}Side`, {
  enumerable: true, configurable: true,
  get() { return this._sides[side]; },
  set(value) {
    if (!(value instanceof LayoutAnchorSide)) throw new TypeError(`${side}Side must be a LayoutAnchorSide`);
    if (this._sides[side] === value) return;
    this._validateChild(value); this._willChange(`${side}Side`);
    value.Parent?.RemoveChild(value);
    if (this._sides[side]) this._sides[side]._parent = null;
    value.Side = side; this._sides[side] = value; value._parent = this;
    this._didChange(`${side}Side`);
  }
});

function contents(node) { return [node, ...node.Descendents()].filter(x => x instanceof LayoutContent); }
function validateLayout(root, { maxNodes = 10000, maxDepth = 64 } = {}) {
  if (!(root instanceof LayoutRoot)) throw new TypeError('Expected LayoutRoot');
  const nodes = new Set(), ids = new Set(), contentIds = new Set();
  function visit(node, depth) {
    if (depth > maxDepth || nodes.size >= maxNodes) throw new RangeError('Layout exceeds node/depth limit');
    if (nodes.has(node)) throw new Error('Layout cycle or repeated node');
    nodes.add(node);
    if (ids.has(node.Id)) throw new Error(`Duplicate layout Id: ${node.Id}`);
    ids.add(node.Id);
    if (node instanceof LayoutContent && node.ContentId != null) {
      if (contentIds.has(node.ContentId)) throw new Error(`Duplicate ContentId: ${node.ContentId}`);
      contentIds.add(node.ContentId);
    }
    for (const child of node.Children) {
      if (child.Parent !== node) throw new Error('Inconsistent layout parent');
      node._validateChild(child, node instanceof LayoutRoot ? (node.Hidden.Contains(child) ? 'Hidden' : node.FloatingWindows.Contains(child) ? 'FloatingWindows' : '') : 'Children');
      visit(child, depth + 1);
    }
  }
  visit(root, 0); return { nodes: nodes.size, contents: contentIds.size };
}
const LayoutTypes = Object.freeze({ LayoutElement, LayoutGroupBase, LayoutGroup, LayoutPositionableGroup,
  LayoutRoot, LayoutPanel, LayoutContent, LayoutDocument, LayoutAnchorable, LayoutPane,
  LayoutDocumentPane, LayoutAnchorablePane, LayoutDocumentPaneGroup, LayoutAnchorablePaneGroup,
  LayoutAnchorSide, LayoutAnchorGroup, LayoutFloatingWindow, LayoutAnchorableFloatingWindow, LayoutDocumentFloatingWindow });

__exports.AnchorSide=AnchorSide;
__exports.AnchorableShowStrategy=AnchorableShowStrategy;
__exports.LayoutElement=LayoutElement;
__exports.LayoutGroupBase=LayoutGroupBase;
__exports.LayoutGroup=LayoutGroup;
__exports.LayoutPositionableGroup=LayoutPositionableGroup;
__exports.LayoutPanel=LayoutPanel;
__exports.LayoutAnchorablePaneGroup=LayoutAnchorablePaneGroup;
__exports.LayoutDocumentPaneGroup=LayoutDocumentPaneGroup;
__exports.LayoutContent=LayoutContent;
__exports.LayoutDocument=LayoutDocument;
__exports.LayoutAnchorable=LayoutAnchorable;
__exports.LayoutPane=LayoutPane;
__exports.LayoutDocumentPane=LayoutDocumentPane;
__exports.LayoutAnchorablePane=LayoutAnchorablePane;
__exports.LayoutAnchorGroup=LayoutAnchorGroup;
__exports.LayoutAnchorSide=LayoutAnchorSide;
__exports.LayoutFloatingWindow=LayoutFloatingWindow;
__exports.LayoutAnchorableFloatingWindow=LayoutAnchorableFloatingWindow;
__exports.LayoutDocumentFloatingWindow=LayoutDocumentFloatingWindow;
__exports.LayoutRoot=LayoutRoot;
__exports.contents=contents;
__exports.validateLayout=validateLayout;
__exports.LayoutTypes=LayoutTypes;
},
"events.js":function(__exports,__require){
/** Small observable primitives. No framework or browser globals are required. */
class EventSignal {
  constructor() { this._listeners = new Set(); }
  add(listener) {
    if (typeof listener !== 'function') throw new TypeError('Event handler must be a function');
    this._listeners.add(listener);
    return () => this.remove(listener);
  }
  remove(listener) { this._listeners.delete(listener); }
  Add(listener) { return this.add(listener); }
  Remove(listener) { this.remove(listener); }
  subscribe(listener) { return this.add(listener); }
  emit(sender, args = {}) { for (const fn of [...this._listeners]) fn(sender, args); }
  clear() { this._listeners.clear(); }
  get Count() { return this._listeners.size; }
}

class CancelEventArgs {
  constructor(values = {}) { this.Cancel = false; Object.assign(this, values); }
  preventDefault() { this.Cancel = true; }
}
class PropertyChangedEventArgs {
  constructor(PropertyName, OldValue, NewValue) { Object.assign(this, { PropertyName, OldValue, NewValue }); }
}
class ObservableObject {
  constructor() {
    this._values = Object.create(null);
    this.PropertyChanging = new EventSignal();
    this.PropertyChanged = new EventSignal();
  }
  on(name, handler) {
    const signal = this[name];
    if (!(signal instanceof EventSignal)) throw new TypeError(`Unknown event: ${name}`);
    return signal.add(handler);
  }
  off(name, handler) { this[name]?.remove(handler); }
  GetValue(property) { return this[typeof property === 'string' ? property : property.Name]; }
  SetValue(property, value) { this[typeof property === 'string' ? property : property.Name] = value; }
  SetCurrentValue(property, value) { this.SetValue(property, value); }
  ClearValue(property) {
    const key = typeof property === 'string' ? property : property.Name;
    const descriptor = getSchema(this.constructor)[key];
    if (!descriptor) throw new TypeError(`Unknown property: ${key}`);
    this[key] = descriptor.default;
  }
  _set(key, value, descriptor = {}) {
    if (descriptor.coerce) value = descriptor.coerce(value);
    if (descriptor.validate && !descriptor.validate(value)) throw new TypeError(`Invalid ${key}: ${value}`);
    this._validateProperty?.(key, value);
    const old = this[key];
    if (Object.is(old, value) || (old instanceof GridLength && value instanceof GridLength && old.Equals(value))) return;
    this._willChange?.(key);
    const args = new PropertyChangedEventArgs(key, old, value);
    this.PropertyChanging.emit(this, args);
    this._values[key] = value;
    descriptor.changed?.call(this, value, old);
    this.PropertyChanged.emit(this, args);
    this._didChange?.(key, args);
  }
}

function getSchema(ctor) {
  const chain = [];
  for (let c = ctor; c && c !== Function.prototype; c = Object.getPrototypeOf(c)) {
    if (Object.hasOwn(c, 'schema')) chain.unshift(c.schema);
  }
  return Object.assign({}, ...chain);
}
function properties(ctor, schema) {
  Object.defineProperty(ctor, 'schema', { value: schema });
  for (const [name, descriptor] of Object.entries(schema)) {
    Object.defineProperty(ctor.prototype, name, {
      configurable: true, enumerable: true,
      get() {
        if (Object.hasOwn(this._values, name)) return this._values[name];
        return descriptor.coerce ? descriptor.coerce(descriptor.default) : descriptor.default;
      },
      set(value) { this._set(name, value, descriptor); }
    });
    Object.defineProperty(ctor, `${name}Property`, { value: Object.freeze({ Name: name, OwnerType: ctor.name }) });
  }
}

class GridLength {
  constructor(value = 1, unit = 'Star') {
    if (!['Star', 'Pixel', 'Auto'].includes(unit)) throw new TypeError('Grid unit must be Star, Pixel, or Auto');
    value = Number(value);
    if (!Number.isFinite(value) || value < 0) throw new RangeError('GridLength must be finite and nonnegative');
    this.Value = value; this.GridUnitType = unit;
    Object.freeze(this);
  }
  get IsStar() { return this.GridUnitType === 'Star'; }
  get IsAbsolute() { return this.GridUnitType === 'Pixel'; }
  get IsAuto() { return this.GridUnitType === 'Auto'; }
  Equals(other) { return other instanceof GridLength && this.Value === other.Value && this.GridUnitType === other.GridUnitType; }
  toString() { return this.IsAuto ? 'Auto' : `${this.Value}${this.IsStar ? '*' : ''}`; }
  toJSON() { return this.toString(); }
  static Parse(value) {
    if (value instanceof GridLength) return value;
    if (typeof value === 'number') return new GridLength(value, 'Pixel');
    if (typeof value !== 'string') throw new TypeError('GridLength expects a number or a string such as "2*"');
    const text = value.trim();
    if (/^auto$/i.test(text)) return new GridLength(1, 'Auto');
    if (/^(?:\d+(?:\.\d+)?|\.\d+)?\*$/.test(text)) return new GridLength(text === '*' ? 1 : Number(text.slice(0, -1)), 'Star');
    if (/^(?:\d+(?:\.\d+)?|\.\d+)(px)?$/i.test(text)) return new GridLength(parseFloat(text), 'Pixel');
    throw new TypeError(`Invalid GridLength: ${value}`);
  }
  static get Auto() { return new GridLength(1, 'Auto'); }
}
const GridUnitType = Object.freeze({ Auto: 'Auto', Pixel: 'Pixel', Star: 'Star' });
const Orientation = Object.freeze({ Horizontal: 'Horizontal', Vertical: 'Vertical' });

/** Numeric indexing, .NET-style methods, and familiar iterable/array helpers. */
class ObservableCollection {
  constructor(items = [], owner = null, role = 'Children') {
    this._items = []; this._owner = owner; this._role = role;
    this.CollectionChanged = new EventSignal();
    const proxy = new Proxy(this, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) return target._items[Number(key)];
        return Reflect.get(target, key, receiver);
      },
      set(target, key, value, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) { receiver.Set(Number(key), value); return true; }
        return Reflect.set(target, key, value, receiver);
      }
    });
    for (const item of items) proxy.Add(item);
    return proxy;
  }
  get Count() { return this._items.length; }
  get length() { return this._items.length; }
  [Symbol.iterator]() { return this._items[Symbol.iterator](); }
  at(index) { return this._items.at(index); }
  get(index) { return this._items[index]; }
  IndexOf(item) { return this._items.indexOf(item); }
  indexOf(item) { return this.IndexOf(item); }
  Contains(item) { return this._items.includes(item); }
  includes(item) { return this.Contains(item); }
  find(fn) { return this._items.find(fn); }
  findIndex(fn) { return this._items.findIndex(fn); }
  filter(fn) { return this._items.filter(fn); }
  map(fn) { return this._items.map(fn); }
  forEach(fn) { return this._items.forEach(fn); }
  every(fn) { return this._items.every(fn); }
  some(fn) { return this._items.some(fn); }
  reduce(fn, initial) { return this._items.reduce(fn, initial); }
  slice(...args) { return this._items.slice(...args); }
  ToArray() { return [...this._items]; }
  Add(item) { this.Insert(this.Count, item); return item; }
  AddRange(items) { for (const item of [...items]) this.Add(item); }
  push(...items) { this.AddRange(items); return this.Count; }
  Insert(index, item) {
    if (!Number.isInteger(index) || index < 0 || index > this.Count) throw new RangeError('Collection insertion index out of range');
    this._owner?._validateChild(item, this._role);
    const oldIndex = this.IndexOf(item);
    if (oldIndex !== -1 && this._owner) {
      this.Move(oldIndex, Math.min(index, this.Count - 1)); return;
    }
    this._owner?._willChange(this._role);
    if (this._owner && item?.Parent) item.Parent.RemoveChild(item);
    this._items.splice(index, 0, item);
    if (this._owner) item._parent = this._owner;
    this._notify({ Action: 'Add', NewItems: [item], OldItems: [], NewStartingIndex: index, OldStartingIndex: -1 });
  }
  Set(index, item) {
    if (index === this.Count) { this.Add(item); return; }
    if (!Number.isInteger(index) || index < 0 || index >= this.Count) throw new RangeError('Collection index out of range');
    if (this._items[index] === item) return;
    this._owner?._validateChild(item, this._role, true);
    if (this._owner && this.Contains(item)) throw new Error('A layout node cannot appear twice in a collection');
    const old = this._items[index];
    this._owner?._willChange(this._role);
    if (this._owner && item?.Parent) item.Parent.RemoveChild(item);
    if (this._owner) { old._parent = null; item._parent = this._owner; }
    this._items[index] = item;
    this._notify({ Action: 'Replace', NewItems: [item], OldItems: [old], NewStartingIndex: index, OldStartingIndex: index });
  }
  Remove(item) { const index = this.IndexOf(item); if (index < 0) return false; this.RemoveAt(index); return true; }
  RemoveAt(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.Count) throw new RangeError('Collection removal index out of range');
    this._owner?._willChange(this._role);
    const [item] = this._items.splice(index, 1);
    if (this._owner) item._parent = null;
    this._notify({ Action: 'Remove', NewItems: [], OldItems: [item], NewStartingIndex: -1, OldStartingIndex: index });
    return item;
  }
  Move(oldIndex, newIndex) {
    if (![oldIndex, newIndex].every(i => Number.isInteger(i) && i >= 0 && i < this.Count)) throw new RangeError('Move index out of range');
    if (oldIndex === newIndex) return;
    this._owner?._willChange(this._role);
    const [item] = this._items.splice(oldIndex, 1);
    this._items.splice(newIndex, 0, item);
    this._notify({ Action: 'Move', NewItems: [item], OldItems: [item], NewStartingIndex: newIndex, OldStartingIndex: oldIndex });
  }
  Clear() {
    if (!this.Count) return;
    this._owner?._willChange(this._role);
    const old = this._items.splice(0);
    if (this._owner) for (const item of old) item._parent = null;
    this._notify({ Action: 'Reset', NewItems: [], OldItems: old, NewStartingIndex: -1, OldStartingIndex: 0 });
  }
  pop() { return this.Count ? this.RemoveAt(this.Count - 1) : undefined; }
  shift() { return this.Count ? this.RemoveAt(0) : undefined; }
  unshift(...items) { items.forEach((x, i) => this.Insert(i, x)); return this.Count; }
  splice(start, deleteCount = this.Count, ...items) {
    start = start < 0 ? Math.max(0, this.Count + start) : Math.min(this.Count, start);
    const removed = [];
    for (let n = Math.min(deleteCount, this.Count - start); n > 0; n--) removed.push(this.RemoveAt(start));
    items.forEach((item, i) => this.Insert(start + i, item));
    return removed;
  }
  _notify(args) {
    this._owner?._collectionChanged(this._role, args);
    this.CollectionChanged.emit(this, args);
  }
}
class RelayCommand {
  constructor(execute, canExecute = () => true) {
    this._execute = execute; this._canExecute = canExecute; this.CanExecuteChanged = new EventSignal();
  }
  CanExecute(parameter) { return !!this._canExecute(parameter); }
  Execute(parameter) { return this.CanExecute(parameter) ? this._execute(parameter) : false; }
  RaiseCanExecuteChanged() { this.CanExecuteChanged.emit(this, {}); }
}
const finite = value => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError('Expected a finite number');
  return number;
};
const positive = value => {
  const number = finite(value);
  if (number < 0) throw new RangeError('Expected a nonnegative number');
  return number;
};
const boolean = value => {
  if (typeof value !== 'boolean') throw new TypeError('Expected a boolean');
  return value;
};
let serial = 0;
function uid(prefix = 'layout') { return `${prefix}-${(++serial).toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }

__exports.EventSignal=EventSignal;
__exports.CancelEventArgs=CancelEventArgs;
__exports.PropertyChangedEventArgs=PropertyChangedEventArgs;
__exports.ObservableObject=ObservableObject;
__exports.getSchema=getSchema;
__exports.properties=properties;
__exports.GridLength=GridLength;
__exports.GridUnitType=GridUnitType;
__exports.Orientation=Orientation;
__exports.ObservableCollection=ObservableCollection;
__exports.RelayCommand=RelayCommand;
__exports.finite=finite;
__exports.positive=positive;
__exports.boolean=boolean;
__exports.uid=uid;
},
"serialization.js":function(__exports,__require){
const { EventSignal, CancelEventArgs, getSchema, GridLength }=__require("events.js");
const { LayoutTypes, LayoutRoot, LayoutPanel, LayoutContent, LayoutAnchorSide, LayoutAnchorGroup, LayoutFloatingWindow, LayoutDocumentFloatingWindow, LayoutDocument, LayoutDocumentPane, contents, validateLayout }=__require("model.js");

const ALLOWED_TYPES = new Set(['LayoutRoot','LayoutPanel','LayoutDocument','LayoutAnchorable','LayoutDocumentPane','LayoutAnchorablePane','LayoutDocumentPaneGroup','LayoutAnchorablePaneGroup','LayoutAnchorSide','LayoutAnchorGroup','LayoutAnchorableFloatingWindow','LayoutDocumentFloatingWindow']);
const SIDES = ['Top','Right','Left','Bottom'];
const EXTRA_KEYS = new Set(['Id', 'IsSelected', 'PreviousContainerId', 'PreviousContainerIndex', 'ReturnLocation']);
const MAX_BYTES = 4 * 1024 * 1024;

function snapshot(root) {
  function encode(node) {
    const props = { Id: node.Id };
    for (const [key, descriptor] of Object.entries(getSchema(node.constructor))) {
      if (descriptor.serialize === false) continue;
      let value = node[key];
      if (value instanceof GridLength) value = value.toString();
      if (value instanceof Date) value = value.toISOString();
      if (value === undefined || typeof value === 'function' || (value && typeof value === 'object' && key !== 'UserData')) continue;
      if (key === 'UserData' && value != null) {
        try { value = JSON.parse(JSON.stringify(value)); } catch { throw new TypeError('UserData must be JSON-serializable'); }
      }
      props[key] = value;
    }
    if (node instanceof LayoutContent) {
      props.IsSelected = node.IsSelected;
      props.PreviousContainerId = node.PreviousContainerId;
      props.PreviousContainerIndex = node.PreviousContainerIndex;
      if (node._return) props.ReturnLocation = { ...node._return };
    }
    if (node instanceof LayoutAnchorGroup) props.PreviousContainerId = node.PreviousContainer?.Id || node.PreviousContainerId;
    const result = { type: node.constructor.name, props };
    if (node instanceof LayoutRoot) {
      result.rootPanel = encode(node.RootPanel);
      result.sides = Object.fromEntries(SIDES.map(side => [side, encode(node[`${side}Side`])]));
      result.floatingWindows = node.FloatingWindows.map(encode);
      result.hidden = node.Hidden.map(encode);
      result.activeContentId = node.ActiveContent?.ContentId || null;
      result.lastFocusedDocumentId = node.LastFocusedDocument?.ContentId || null;
    } else if (node.ChildrenCount) result.children = [...node.Children].map(encode);
    return result;
  }
  return { format: 'avalondock-web', version: 1, layout: encode(root) };
}

function hydrate(data, registry = new Map(), { maxNodes = 10000, maxDepth = 64, onContent = null, strict = true } = {}) {
  if (typeof data === 'string') {
    if (data.length > MAX_BYTES) throw new RangeError('Layout exceeds the 4 MiB input limit');
    data = JSON.parse(data);
  }
  if (!data || typeof data !== 'object' || data.format !== 'avalondock-web' || data.version !== 1) throw new TypeError('Unsupported layout format or version');
  let count = 0;
  const pendingSelection = [], pendingPrevious = [], cancelled = [], unique = new Set();
  function decode(record, depth) {
    if (++count > maxNodes || depth > maxDepth) throw new RangeError('Layout exceeds the node/depth limit');
    if (!record || typeof record !== 'object' || !ALLOWED_TYPES.has(record.type)) throw new TypeError(`Unknown layout type: ${record?.type}`);
    const Type = LayoutTypes[record.type], node = new Type(), schema = getSchema(Type);
    const props = record.props || {};
    if (!props || typeof props !== 'object' || Array.isArray(props)) throw new TypeError('Layout props must be an object');
    for (const [key, value] of Object.entries(props)) {
      if (['__proto__','constructor','prototype','Content','Parent','Manager','Root'].includes(key) || key.startsWith('_')) throw new TypeError(`Unsafe layout property: ${key}`);
      if (!Object.hasOwn(schema, key) && !EXTRA_KEYS.has(key)) {
        if (strict) throw new TypeError(`Unknown property ${record.type}.${key}`);
        continue;
      }
      if (key === 'IsSelected') { if (typeof value !== 'boolean') throw new TypeError('Invalid IsSelected'); if (value) pendingSelection.push(node); }
      else if (key === 'PreviousContainerId') { if (value != null) pendingPrevious.push([node, String(value)]); }
      else if (key === 'ReturnLocation') {
        if (value && typeof value === 'object') node._return = { paneId: String(value.paneId || ''), side: SIDES.includes(value.side) ? value.side : 'Right', index: Math.max(0, Number(value.index) || 0), kind: value.kind === 'document' ? 'document' : 'anchorable' };
      } else if (key === 'Id') {
        if (typeof value !== 'string' || !value || value.length > 512) throw new TypeError('Invalid layout Id');
        node.Id = value;
      } else node[key] = value;
    }
    if (node instanceof LayoutContent) {
      if (!node.ContentId) node.ContentId = node.Id;
      if (unique.has(node.ContentId)) throw new Error(`Duplicate ContentId: ${node.ContentId}`);
      unique.add(node.ContentId);
      const entry = registry.get(node.ContentId);
      if (entry) node.Content = entry instanceof LayoutContent ? entry.Content : entry.Content ?? entry;
      const args = new LayoutSerializationCallbackEventArgs(node, node.Content);
      onContent?.(args);
      if (args.Cancel) cancelled.push(node);
      else node.Content = args.Content;
    }
    if (node instanceof LayoutRoot) {
      if (!record.rootPanel) throw new TypeError('LayoutRoot requires rootPanel');
      node.RootPanel = decode(record.rootPanel, depth + 1);
      for (const side of SIDES) if (record.sides?.[side]) node[`${side}Side`] = decode(record.sides[side], depth + 1);
      for (const child of array(record.floatingWindows)) node.FloatingWindows.Add(decode(child, depth + 1));
      for (const child of array(record.hidden)) node.Hidden.Add(decode(child, depth + 1));
      node._restoreActiveId = record.activeContentId || null;
      node._restoreLastId = record.lastFocusedDocumentId || null;
    } else {
      if (node instanceof LayoutContent && record.children?.length) throw new TypeError('Content cannot contain layout children');
      for (const child of array(record.children)) node.Children.Add(decode(child, depth + 1));
    }
    return node;
  }
  const root = decode(data.layout, 0);
  if (!(root instanceof LayoutRoot)) throw new TypeError('Top-level layout must be LayoutRoot');
  const byId = new Map([root, ...root.Descendents()].map(n => [n.Id, n]));
  for (const [node, id] of pendingPrevious) { node.PreviousContainerId = id; if (byId.has(id)) node.PreviousContainer = byId.get(id); }
  for (const node of pendingSelection) node.IsSelected = true;
  for (const node of cancelled) node.Parent?.RemoveChild(node);
  root.CollectGarbage();
  validateLayout(root, { maxNodes, maxDepth });
  const all = contents(root);
  root._activeContent = all.find(x => x.ContentId === root._restoreActiveId && x.IsVisible) || null;
  root._activeContent?._setActive(true);
  root._lastFocusedDocument = all.find(x => x.ContentId === root._restoreLastId) || null;
  return root;
}
function array(value) { if (value == null) return []; if (!Array.isArray(value)) throw new TypeError('Expected a layout array'); return value; }

class LayoutSerializationCallbackEventArgs extends CancelEventArgs {
  constructor(Model, Content = null) { super({ Model, Content }); }
}
class LayoutSerializer {
  constructor(manager) {
    if (!manager?.Layout) throw new TypeError('A DockingManager is required');
    this.Manager = manager; this.LayoutSerializationCallback = new EventSignal();
  }
  _registry() { this.Manager._registerContents(); return this.Manager._registry; }
  _apply(data, options = {}) {
    const root = hydrate(data, this._registry(), {
      ...options,
      onContent: args => this.LayoutSerializationCallback.emit(this, args)
    });
    this.Manager.Layout = root;
    return root;
  }
}
class JsonLayoutSerializer extends LayoutSerializer {
  Serialize(writer = null) { return writeResult(writer, JSON.stringify(snapshot(this.Manager.Layout), null, 2)); }
  Deserialize(value, options) { return this._apply(value, options); }
}
class XmlLayoutSerializer extends LayoutSerializer {
  Serialize(writer = null) { return writeResult(writer, toXml(this.Manager.Layout)); }
  Deserialize(value, options) {
    if (typeof value !== 'string') {
      if (value?.documentElement && typeof XMLSerializer !== 'undefined') value = new XMLSerializer().serializeToString(value);
      else throw new TypeError('Deserialize expects XML text (read File.text() first), not a filesystem path');
    }
    return this._apply(xmlToSnapshot(value), options);
  }
}
function writeResult(writer, text) {
  if (writer == null) return text;
  if (typeof writer.Write === 'function') writer.Write(text);
  else if (typeof writer.write === 'function') writer.write(text);
  else throw new TypeError('Serialize accepts a writer with Write/write, or no argument to return text');
  return text;
}
function escapeXml(value) {
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '\uFFFD').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');
}
function toXml(root) {
  const data = snapshot(root).layout;
  function encode(node, tag = node.type, depth = 1) {
    const pad = '  '.repeat(depth);
    const attrs = [];
    for (const [key, value] of Object.entries(node.props || {})) {
      if (value == null || typeof value === 'object' || key === 'UserData') continue;
      attrs.push(`${key}="${escapeXml(value)}"`);
    }
    let children = node.children || [];
    // Native AvalonDock document floating windows contain one LayoutDocument directly.
    if (node.type === 'LayoutDocumentFloatingWindow' && children[0]?.type === 'LayoutDocumentPane') {
      if (children[0].children?.length !== 1 || children[0].children[0].type !== 'LayoutDocument') throw new Error('Native XML cannot represent a multi-document floating pane. Use JSON for this web extension.');
      children = children[0].children;
    }
    const head = `${pad}<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}`;
    return children.length ? `${head}>\n${children.map(c => encode(c, c.type, depth + 1)).join('\n')}\n${pad}</${tag}>` : `${head} />`;
  }
  const parts = ['<?xml version="1.0" encoding="utf-8"?>', '<LayoutRoot>'];
  parts.push(encode(data.rootPanel, 'RootPanel'));
  for (const side of SIDES) parts.push(encode(data.sides[side], `${side}Side`));
  for (const [tag, children] of [['FloatingWindows', data.floatingWindows], ['Hidden', data.hidden]]) {
    parts.push(children.length ? `  <${tag}>\n${children.map(c => encode(c, c.type, 2)).join('\n')}\n  </${tag}>` : `  <${tag} />`);
  }
  parts.push('</LayoutRoot>'); return parts.join('\n');
}

/** Strict, bounded layout-only XML reader. No DTDs, entities, code or content markup. */
function parseLayoutXml(text) {
  if (typeof text !== 'string' || text.length > MAX_BYTES) throw new RangeError('XML must be text under 4 MiB');
  text = text.replace(/^\uFEFF/, '');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new TypeError('DTDs and entity declarations are not allowed');
  const stack = [], roots = [];
  let pos = 0, count = 0;
  while (pos < text.length) {
    if (/\s/.test(text[pos])) { pos++; continue; }
    if (text.startsWith('<!--', pos)) { const end = text.indexOf('-->', pos + 4); if (end < 0) throw new Error('Unclosed XML comment'); pos = end + 3; continue; }
    if (text.startsWith('<?xml', pos) && roots.length === 0 && stack.length === 0) {
      const end = text.indexOf('?>', pos + 5); if (end < 0) throw new Error('Unclosed XML declaration'); pos = end + 2; continue;
    }
    if (text[pos] !== '<') throw new TypeError('Layout XML cannot contain text content');
    const match = /^<\s*(\/?)\s*([A-Za-z_][\w.:-]*)/.exec(text.slice(pos));
    if (!match) throw new Error(`Invalid XML near position ${pos}`);
    const closing = !!match[1], fullName = match[2], name = fullName.split(':').pop();
    pos += match[0].length;
    if (closing) {
      const end = /^\s*>/.exec(text.slice(pos));
      if (!end || !stack.length || stack.at(-1).fullName !== fullName) throw new Error('Mismatched XML closing tag');
      pos += end[0].length; stack.pop(); continue;
    }
    const attrs = Object.create(null); let selfClosing = false;
    for (;;) {
      const spaces = /^\s*/.exec(text.slice(pos))[0].length; pos += spaces;
      if (text.startsWith('/>', pos)) { selfClosing = true; pos += 2; break; }
      if (text[pos] === '>') { pos++; break; }
      const attr = /^([A-Za-z_][\w.:-]*)\s*=\s*(["'])([^]*?)\2/.exec(text.slice(pos));
      if (!attr || !spaces) throw new Error(`Malformed XML attribute at ${pos}`);
      if (Object.hasOwn(attrs, attr[1])) throw new Error('Duplicate XML attribute');
      if (attr[3].includes('<')) throw new Error('Unescaped XML attribute');
      attrs[attr[1]] = unescapeXml(attr[3]); pos += attr[0].length;
    }
    if (++count > 10000 || stack.length > 64) throw new RangeError('XML exceeds the node/depth limit');
    const element = { name, fullName, attrs, children: [] };
    if (stack.length) stack.at(-1).children.push(element); else roots.push(element);
    if (!selfClosing) stack.push(element);
  }
  if (stack.length || roots.length !== 1 || roots[0].name !== 'LayoutRoot') throw new Error('XML requires one complete LayoutRoot');
  return roots[0];
}
function unescapeXml(text) {
  return text.replace(/&([^;\s]*);?/g, (whole, entity) => {
    if (!whole.endsWith(';')) throw new Error('Malformed XML entity');
    const predefined = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(predefined, entity)) return predefined[entity];
    const match = /^#(x[0-9a-f]+|\d+)$/i.exec(entity);
    if (!match) throw new Error(`Unsupported XML entity: ${entity}`);
    const point = match[1][0].toLowerCase() === 'x' ? parseInt(match[1].slice(1), 16) : Number(match[1]);
    if (point < 0x20 && ![9,10,13].includes(point) || point > 0x10ffff || point >= 0xd800 && point <= 0xdfff) throw new Error('Invalid XML character');
    return String.fromCodePoint(point);
  });
}
function xmlToSnapshot(text) {
  const xml = parseLayoutXml(text);
  function decode(element, forcedType) {
    const type = forcedType || element.name;
    if (!ALLOWED_TYPES.has(type)) throw new TypeError(`Unsupported XML layout element: ${element.name}`);
    const schema = getSchema(LayoutTypes[type]), props = {};
    for (const [key, raw] of Object.entries(element.attrs)) {
      if (key === 'xmlns' || key.startsWith('xmlns:') || key.startsWith('xsi:')) continue;
      if (key === 'Id' || key === 'PreviousContainerId') props[key] = raw;
      else if (key === 'IsSelected') { if (!/^(true|false)$/i.test(raw)) throw new TypeError('Invalid XML boolean'); props[key] = raw.toLowerCase() === 'true'; }
      else if (Object.hasOwn(schema, key) && schema[key].serialize !== false && key !== 'UserData') {
        const defaultValue = schema[key].default;
        if (typeof defaultValue === 'boolean') {
          if (!/^(true|false)$/i.test(raw)) throw new TypeError(`Invalid boolean ${key}`);
          props[key] = raw.toLowerCase() === 'true';
        } else if (typeof defaultValue === 'number') { if (raw.trim() === '' || !Number.isFinite(Number(raw))) throw new TypeError(`Invalid numeric ${key}`); props[key] = Number(raw); }
        else props[key] = raw;
      } else throw new TypeError(`Unsupported XML attribute ${type}.${key}`);
    }
    if (type === 'LayoutRoot') {
      const result = { type, props, sides: {}, floatingWindows: [], hidden: [] }, seen = new Set();
      for (const child of element.children) {
        if (seen.has(child.name)) throw new Error(`Duplicate ${child.name}`); seen.add(child.name);
        if (child.name === 'RootPanel' || child.name === 'LayoutPanel') result.rootPanel = decode(child, 'LayoutPanel');
        else if (SIDES.some(s => `${s}Side` === child.name)) {
          const side = child.name.replace('Side', '');
          const sideNode = child.children.length === 1 && child.children[0].name === 'LayoutAnchorSide' ? child.children[0] : child;
          result.sides[side] = decode(sideNode, 'LayoutAnchorSide'); result.sides[side].props.Side = side;
        } else if (child.name === 'FloatingWindows') result.floatingWindows = child.children.map(x => decode(x));
        else if (child.name === 'Hidden') result.hidden = child.children.map(x => decode(x));
        else throw new TypeError(`Unsupported root section: ${child.name}`);
      }
      if (!result.rootPanel) result.rootPanel = { type: 'LayoutPanel', props: {}, children: [] };
      return result;
    }
    return { type, props, children: element.children.map(x => decode(x)) };
  }
  return { format: 'avalondock-web', version: 1, layout: decode(xml) };
}

__exports.snapshot=snapshot;
__exports.hydrate=hydrate;
__exports.LayoutSerializationCallbackEventArgs=LayoutSerializationCallbackEventArgs;
__exports.LayoutSerializer=LayoutSerializer;
__exports.JsonLayoutSerializer=JsonLayoutSerializer;
__exports.XmlLayoutSerializer=XmlLayoutSerializer;
__exports.toXml=toXml;
__exports.xmlToSnapshot=xmlToSnapshot;
},
"controls.js":function(__exports,__require){
const { LayoutContent, LayoutDocument, LayoutAnchorable, LayoutPanel, LayoutDocumentPane, LayoutAnchorablePane, LayoutDocumentPaneGroup, LayoutAnchorablePaneGroup, LayoutAnchorGroup, LayoutAnchorSide, LayoutDocumentFloatingWindow, LayoutAnchorableFloatingWindow }=__require("model.js");
/** View adapters expose the actual retained DOM element; the layout model remains authoritative. */
class LayoutControl {
  constructor(model,manager=model?.Manager){this.Model=model;this.Manager=manager;}
  get Element(){return this.Manager?._view?.elementFor(this.Model)||null;}
  Focus(){this.Element?.focus({preventScroll:true});}
}
class LayoutDocumentControl extends LayoutControl {get Element(){return this.Manager?._view?.contentElement(this.Model)||null;}}
class LayoutAnchorableControl extends LayoutDocumentControl {}
class LayoutPanelControl extends LayoutControl {}
class LayoutDocumentPaneControl extends LayoutControl {}
class LayoutAnchorablePaneControl extends LayoutControl {}
class LayoutDocumentPaneGroupControl extends LayoutControl {}
class LayoutAnchorablePaneGroupControl extends LayoutControl {}
class LayoutAnchorGroupControl extends LayoutControl {}
class LayoutAnchorSideControl extends LayoutControl {get Element(){return this.Manager?._view?.sideElements[this.Model.Side]||null;}}
class LayoutFloatingWindowControl extends LayoutControl {
  Show(){this.Manager?._view?.requestRender();}
  Close(){return this.Manager.CloseFloatingWindow(this.Model);}
  Dock(){return this.Manager.Dock(this.Model);}
  Maximize(){this.Manager.Transaction('Maximize window',()=>{this.Model.IsMaximized=true;});}
  Restore(){this.Manager.Transaction('Restore window',()=>{this.Model.IsMaximized=false;});}
  get IsMaximized(){return this.Model.IsMaximized;}
}
class LayoutDocumentFloatingWindowControl extends LayoutFloatingWindowControl {}
class LayoutAnchorableFloatingWindowControl extends LayoutFloatingWindowControl {}
class LayoutAutoHideWindowControl extends LayoutControl {
  get Element(){return this.Manager?._view?.peek||null;}
  Show(model=this.Model){return this.Manager.ShowAutoHideWindow(model);}
  Hide(){this.Manager.HideAutoHideWindow();}
}
class LayoutAnchorControl extends LayoutControl {
  get Element(){return this.Manager?._view?.records.get(this.Model.Parent?.Id)?.buttons.get(this.Model.ContentId)||null;}
}
class NavigatorWindow extends LayoutControl {
  constructor(manager){super(null,manager);}
  get Element(){return this.Manager?._view?.navigator||null;}
  Show(){this.Manager.ShowNavigator();}
  Close(){this.Manager?._view?.closeNavigator(false);}
}
const types=[[LayoutDocument,LayoutDocumentControl],[LayoutAnchorable,LayoutAnchorableControl],[LayoutDocumentPane,LayoutDocumentPaneControl],[LayoutAnchorablePane,LayoutAnchorablePaneControl],[LayoutDocumentPaneGroup,LayoutDocumentPaneGroupControl],[LayoutAnchorablePaneGroup,LayoutAnchorablePaneGroupControl],[LayoutPanel,LayoutPanelControl],[LayoutAnchorGroup,LayoutAnchorGroupControl],[LayoutAnchorSide,LayoutAnchorSideControl],[LayoutDocumentFloatingWindow,LayoutDocumentFloatingWindowControl],[LayoutAnchorableFloatingWindow,LayoutAnchorableFloatingWindowControl]];
function controlFor(model,manager){const Type=types.find(([Model])=>model instanceof Model)?.[1]||LayoutControl;return new Type(model,manager);}

__exports.LayoutControl=LayoutControl;
__exports.LayoutDocumentControl=LayoutDocumentControl;
__exports.LayoutAnchorableControl=LayoutAnchorableControl;
__exports.LayoutPanelControl=LayoutPanelControl;
__exports.LayoutDocumentPaneControl=LayoutDocumentPaneControl;
__exports.LayoutAnchorablePaneControl=LayoutAnchorablePaneControl;
__exports.LayoutDocumentPaneGroupControl=LayoutDocumentPaneGroupControl;
__exports.LayoutAnchorablePaneGroupControl=LayoutAnchorablePaneGroupControl;
__exports.LayoutAnchorGroupControl=LayoutAnchorGroupControl;
__exports.LayoutAnchorSideControl=LayoutAnchorSideControl;
__exports.LayoutFloatingWindowControl=LayoutFloatingWindowControl;
__exports.LayoutDocumentFloatingWindowControl=LayoutDocumentFloatingWindowControl;
__exports.LayoutAnchorableFloatingWindowControl=LayoutAnchorableFloatingWindowControl;
__exports.LayoutAutoHideWindowControl=LayoutAutoHideWindowControl;
__exports.LayoutAnchorControl=LayoutAnchorControl;
__exports.NavigatorWindow=NavigatorWindow;
__exports.controlFor=controlFor;
},
"themes.js":function(__exports,__require){
/** Theme names retained as API adapters; these are original CSS themes, not WPF resources. */
class Theme {
  constructor(name = 'dark', variables = {}) { this.Name = name; this.Variables = { ...variables }; }
  GetResourceUri() { return new URL('./avalondock.css', __base).href; }
  toString() { return this.Name; }
}
class GenericTheme extends Theme { constructor() { super('light'); } }
class AeroTheme extends Theme { constructor() { super('aero'); } }
class VS2010Theme extends Theme { constructor() { super('vs2010'); } }
class MetroTheme extends Theme { constructor() { super('metro'); } }
class DarkTheme extends Theme { constructor() { super('dark'); } }
class LightTheme extends Theme { constructor() { super('light'); } }
class HighContrastTheme extends Theme { constructor() { super('contrast'); } }

__exports.Theme=Theme;
__exports.GenericTheme=GenericTheme;
__exports.AeroTheme=AeroTheme;
__exports.VS2010Theme=VS2010Theme;
__exports.MetroTheme=MetroTheme;
__exports.DarkTheme=DarkTheme;
__exports.LightTheme=LightTheme;
__exports.HighContrastTheme=HighContrastTheme;
},
"items.js":function(__exports,__require){
const { ObservableObject, RelayCommand, CancelEventArgs }=__require("events.js");
const { LayoutDocumentPane, LayoutAnchorable, LayoutDocument, LayoutFloatingWindow }=__require("model.js");
class LayoutItem extends ObservableObject {
  constructor(manager, model) {
    super(); this.Manager = manager; this.LayoutElement = model; this.Model = model.Content;
    this._unsubscribe = model.PropertyChanged.add((_sender, args) => { this.PropertyChanged.emit(this, args); this.RaiseCanExecuteChanged(); });
    const command = (name, execute, canExecute) => { this[name] = new RelayCommand(execute, canExecute); };
    command('ActivateCommand', () => manager.Activate(model), () => model.IsEnabled && model.Root === manager.Layout);
    command('CloseCommand', () => model.Close(), () => model.CanClose && model.Root === manager.Layout);
    command('FloatCommand', () => model.Float(), () => model.CanFloat && model.CanMove && !model.IsFloating);
    command('DockAsDocumentCommand', () => model.DockAsDocument(), () => model.CanDock && model.CanMove && !(model.Parent instanceof LayoutDocumentPane) && (!(model instanceof LayoutAnchorable) || model.CanDockAsTabbedDocument));
    command('CloseAllButThisCommand', () => manager.CloseAll(model, model.Parent instanceof LayoutDocumentPane ? model.Parent : null), () => model.Parent instanceof LayoutDocumentPane && model.Parent.ChildrenCount > 1);
    command('CloseAllCommand', () => manager.CloseAll(null, model.Parent instanceof LayoutDocumentPane ? model.Parent : null), () => model.Parent instanceof LayoutDocumentPane);
    command('NewVerticalTabGroupCommand', () => manager.NewTabGroup(model, 'Vertical'), () => model.Parent instanceof LayoutDocumentPane && model.Parent.ChildrenCount > 1 && model.CanMove && manager.CanDockAt(model, model.Parent, 'Right'));
    command('NewHorizontalTabGroupCommand', () => manager.NewTabGroup(model, 'Horizontal'), () => model.Parent instanceof LayoutDocumentPane && model.Parent.ChildrenCount > 1 && model.CanMove && manager.CanDockAt(model, model.Parent, 'Bottom'));
    command('MoveToNextTabGroupCommand', () => manager.MoveToTabGroup(model, 1), () => this._canMoveGroup(1));
    command('MoveToPreviousTabGroupCommand', () => manager.MoveToTabGroup(model, -1), () => this._canMoveGroup(-1));
    command('DockCommand', () => manager.Dock(model), () => model.CanDock && model.CanMove && (model.IsFloating || model.IsAutoHidden));
  }
  RaiseCanExecuteChanged() { for (const value of Object.values(this)) if (value instanceof RelayCommand) value.RaiseCanExecuteChanged(); }
  Dispose() { this._unsubscribe?.(); this._unsubscribe = null; }
  _canMoveGroup(direction) {
    const panes = [...this.Manager.Layout.RootPanel.Descendents()].filter(x => x instanceof LayoutDocumentPane);
    const target = panes[panes.indexOf(this.LayoutElement.Parent) + direction];
    return !!target && this.Manager.CanDockAt(this.LayoutElement, target);
  }
  get View() { return this.Manager._view?.contentElement(this.LayoutElement); }
}
for (const key of ['Title','ContentId','IconSource','ToolTip','CanClose','CanFloat','IsSelected','IsActive','IsEnabled','Description']) Object.defineProperty(LayoutItem.prototype, key, {
  get() { return this.LayoutElement[key]; }, set(value) { this.LayoutElement[key] = value; }
});
class LayoutDocumentItem extends LayoutItem {}
class LayoutAnchorableItem extends LayoutItem {
  constructor(manager, model) {
    super(manager, model);
    this.HideCommand = new RelayCommand(() => model.Hide(), () => model.CanHide && !model.IsHidden);
    this.AutoHideCommand = new RelayCommand(() => model.ToggleAutoHide(), () => model.CanAutoHide && !model.IsFloating && (model.IsAutoHidden || !!model.Parent?.CanAutoHide));
  }
  get CanHide() { return this.LayoutElement.CanHide; }
  set CanHide(value) { this.LayoutElement.CanHide = value; }
  get CanAutoHide() { return this.LayoutElement.CanAutoHide; }
  set CanAutoHide(value) { this.LayoutElement.CanAutoHide = value; }
}
class DocumentClosingEventArgs extends CancelEventArgs { constructor(Document) { super({Document, Model:Document}); } }
class DocumentClosedEventArgs { constructor(Document) { this.Document = Document; } }
class LayoutEventArgs { constructor(Layout) { this.Layout = Layout; } }
class LayoutElementEventArgs { constructor(Element) { this.Element = Element; } }

__exports.LayoutItem=LayoutItem;
__exports.LayoutDocumentItem=LayoutDocumentItem;
__exports.LayoutAnchorableItem=LayoutAnchorableItem;
__exports.DocumentClosingEventArgs=DocumentClosingEventArgs;
__exports.DocumentClosedEventArgs=DocumentClosedEventArgs;
__exports.LayoutEventArgs=LayoutEventArgs;
__exports.LayoutElementEventArgs=LayoutElementEventArgs;
},
"manager.js":function(__exports,__require){
const { ObservableObject, ObservableCollection, EventSignal, CancelEventArgs, properties, getSchema, positive, boolean, uid }=__require("events.js");
const { LayoutRoot, LayoutPanel, LayoutContent, LayoutDocument, LayoutAnchorable, LayoutPane, LayoutDocumentPane, LayoutAnchorablePane, LayoutDocumentPaneGroup, LayoutAnchorablePaneGroup, LayoutAnchorGroup, LayoutFloatingWindow, LayoutDocumentFloatingWindow, LayoutAnchorableFloatingWindow, AnchorableShowStrategy, contents, validateLayout }=__require("model.js");
const { snapshot, hydrate, JsonLayoutSerializer, XmlLayoutSerializer }=__require("serialization.js");
const { LayoutDocumentItem, LayoutAnchorableItem }=__require("items.js");
const { DockRenderer }=__require("view.js");

const EVENTS = ['ActiveContentChanged','DocumentClosing','DocumentClosed','AnchorableClosing','AnchorableClosed','AnchorableHiding','AnchorableHidden','LayoutChanging','LayoutChanged','LayoutUpdated','LayoutFloatingWindowControlCreated','LayoutFloatingWindowControlClosed','HistoryChanged','Error','ContentMoved','ThemeChanged'];
function identitySnapshot(value) {
  return JSON.stringify(value, (key, val) => ['LastActivationTimeStamp','activeContentId','lastFocusedDocumentId','IsSelected'].includes(key) ? undefined : val);
}
class DockingManager extends ObservableObject {
  constructor(hostOrOptions = {}, options = {}) {
    super();
    const host = hostOrOptions?.nodeType === 1 ? hostOrOptions : hostOrOptions?.Host || null;
    if (!hostOrOptions?.nodeType) options = hostOrOptions || {};
    for (const name of EVENTS) this[name] = new EventSignal();
    this.Id = uid('manager'); this.Host = null; this._view = null;
    this._registry = new Map(); this._items = new Map(); this._sources = new Map();
    this._undo = []; this._redo = []; this._depth = 0; this._suspended = 1; this._pendingBefore = null;
    this._queued = false; this._disposed = false; this._mru = []; this._autoHideModel = null;
    this._layout = new LayoutRoot({ RootPanel: new LayoutPanel({ Children: [new LayoutDocumentPane()] }) });
    this._layout._manager = this;
    for (const [key, value] of Object.entries(options)) {
      if (key === 'Host' || key === 'Layout' || key === 'DocumentsSource' || key === 'AnchorablesSource') continue;
      if (key.startsWith('_') || ['__proto__','constructor','prototype'].includes(key)) throw new TypeError(`Invalid manager option ${key}`);
      if (this[key] instanceof EventSignal && typeof value === 'function') this[key].add(value);
      else this[key] = value;
    }
    if (options.Layout) this._replaceLayout(options.Layout);
    if (options.DocumentsSource) this.DocumentsSource = options.DocumentsSource;
    if (options.AnchorablesSource) this.AnchorablesSource = options.AnchorablesSource;
    this._normalize(); this._registerContents(); this._suspended = 0;
    this._lastSnapshot = snapshot(this.Layout);
    if (host) this.Attach(host);
    if (this.StorageKey && this.RestoreOnLoad) this.LoadFromStorage();
  }
  get Layout() { return this._layout; }
  set Layout(value) {
    if (value === this._layout) return;
    if (!(value instanceof LayoutRoot)) throw new TypeError('Layout must be a LayoutRoot');
    validateLayout(value);
    this.Transaction('Replace layout', () => this._replaceLayout(value));
  }
  _replaceLayout(value) {
    if (!(value instanceof LayoutRoot)) throw new TypeError('Layout must be a LayoutRoot');
    if (value._manager && value._manager !== this) throw new Error('This LayoutRoot is attached to another manager');
    validateLayout(value);
    const old = this._layout;
    this._emit('LayoutChanging', { OldLayout: old, NewLayout: value });
    if (old) old._manager = null;
    this._layout = value; value._manager = this; this._autoHideModel = null;
    this._registerContents(); for (const item of this._items.values()) item.Dispose(); this._items.clear();
    this._emit('LayoutChanged', { OldLayout: old, Layout: value });
    this._view?.requestRender();
  }
  get ActiveContent() { return this.Layout.ActiveContent?.Content ?? null; }
  set ActiveContent(value) { this.Activate(value); }
  get ActiveModel() { return this.Layout.ActiveContent; }
  get FloatingWindows() { return this.Layout.FloatingWindows.ToArray().map(x => this._view?.controlFor(x) || x); }
  get AutoHideWindow() { return this._autoHideModel ? { Model: this._autoHideModel, Element: this._view?.peek || null, Hide: () => this.HideAutoHideWindow() } : null; }
  get LayoutRootPanel() { return this._view?.elementFor(this.Layout.RootPanel) || null; }
  get LeftSidePanel() { return this._view?.sideElements.Left || null; }
  get RightSidePanel() { return this._view?.sideElements.Right || null; }
  get TopSidePanel() { return this._view?.sideElements.Top || null; }
  get BottomSidePanel() { return this._view?.sideElements.Bottom || null; }
  get CanUndo() { return this._undo.length > 0; }
  get CanRedo() { return this._redo.length > 0; }
  get DocumentsSource() { return this._sources.get('document')?.source || null; }
  set DocumentsSource(value) { this._bindSource('document', value); }
  get AnchorablesSource() { return this._sources.get('anchorable')?.source || null; }
  set AnchorablesSource(value) { this._bindSource('anchorable', value); }
  Attach(host) {
    if (!host || host.nodeType !== 1) throw new TypeError('Attach requires an HTMLElement');
    if (this._disposed) throw new Error('DockingManager has been disposed');
    if (this.Host === host) return this;
    this._view?.dispose(); this.Host = host;
    this._view = new DockRenderer(this, host); this._view.render(); return this;
  }
  Detach() { this._view?.dispose(); this._view = null; this.Host = null; }
  Dispose() {
    if (this._disposed) return;
    this._disposed = true; this.Detach();
    for (const binding of this._sources.values()) binding.unsubscribe?.();
    this._sources.clear(); this._registry.clear(); for (const item of this._items.values()) item.Dispose(); this._items.clear(); this._undo = []; this._redo = [];
    this.Layout._manager = null;
    for (const event of EVENTS) this[event].clear();
  }
  dispose() { this.Dispose(); }
  OnApplyTemplate() { this._view?.invalidateTemplates(); this._view?.render(); }
  ApplyTemplate() { this.OnApplyTemplate(); return !!this.Host; }
  Refresh() { this.RefreshSources(); this._view?.requestRender(); }
  _emit(name, args = {}) {
    this[name]?.emit(this, args);
    if (this.Host && typeof CustomEvent !== 'undefined') {
      const event = new CustomEvent(`avalondock:${name}`, { detail: args, bubbles: true, composed: true, cancelable: args instanceof CancelEventArgs });
      this.Host.dispatchEvent(event); if (event.defaultPrevented) args.Cancel = true;
    }
  }
  _willChange(name) { this._modelWillChange(this, name); }
  _didChange(name) {
    if (name === 'Theme') this._emit('ThemeChanged', { Theme: this.Theme });
    this._modelDidChange(this, name);
  }
  _modelWillChange(_model, name) {
    if (this._disposed || this._suspended || this._depth || ['ActualWidth','ActualHeight'].includes(name)) return;
    if (!this._pendingBefore) this._pendingBefore = snapshot(this.Layout);
  }
  _modelDidChange(_model, name) {
    if (this._disposed || this._suspended) return;
    if (!this._queued) {
      this._queued = true;
      queueMicrotask(() => {
        this._queued = false;
        if (this._disposed || this._depth) return;
        try { this._normalize(); this._commit(this._pendingBefore, 'Edit layout'); }
        catch (error) { this._emit('Error', { Error: error, Operation: 'Layout update' }); }
      });
    }
    this._view?.requestRender();
  }
  _registerContents() {
    for (const model of contents(this.Layout)) {
      if (model.ContentId == null) model._values.ContentId = model.Id;
      this._registry.set(model.ContentId, model);
    }
  }
  _normalize() {
    this._suspended++;
    try {
      this._registerContents();
      this.Layout.CollectGarbage();
      if (![...this.Layout.RootPanel.Descendents()].some(x => x instanceof LayoutDocumentPane)) this.Layout.RootPanel.Children.Add(new LayoutDocumentPane());
      const all = contents(this.Layout);
      if (!all.includes(this.Layout._activeContent) || this.Layout._activeContent?.IsHidden || !this.Layout._activeContent?.IsEnabled) {
        const next = this._mru.map(id => all.find(c => c.ContentId === id)).find(c => c && c.IsVisible && !c.IsAutoHidden && c.IsEnabled)
          || all.find(c => c instanceof LayoutDocument && c.IsVisible && c.IsEnabled)
          || all.find(c => c.IsVisible && !c.IsAutoHidden && c.IsEnabled) || null;
        this._activate(next, false);
      }
      if (!all.includes(this.Layout._lastFocusedDocument)) this.Layout._lastFocusedDocument = all.find(c => c instanceof LayoutDocument) || null;
      if (this._autoHideModel && !this._autoHideModel.IsAutoHidden) this._autoHideModel = null;
      validateLayout(this.Layout);
    } finally { this._suspended--; }
  }
  _commit(before, label) {
    this._registerContents();
    const after = snapshot(this.Layout);
    if (before && !this._suspended && identitySnapshot(before) !== identitySnapshot(after) && this.EnableHistory) {
      this._undo.push({ before, after, label });
      while (this._undo.length > this.HistoryLimit) this._undo.shift();
      this._redo.length = 0; this._emit('HistoryChanged', { CanUndo: this.CanUndo, CanRedo: this.CanRedo, Label: label });
    }
    this._pendingBefore = null; this._lastSnapshot = after;
    for (const item of this._items.values()) item.RaiseCanExecuteChanged();
    this.Layout.Updated.emit(this.Layout, {});
    this._emit('LayoutUpdated', { Layout: this.Layout, Label: label });
    this._view?.requestRender();
    if (this.StorageKey && this.AutoSave) this.SaveToStorage();
  }
  Transaction(label, action) {
    if (typeof label === 'function') { action = label; label = 'Edit layout'; }
    if (typeof action !== 'function') throw new TypeError('Transaction requires a callback');
    if (this._disposed) throw new Error('DockingManager has been disposed');
    if (this._depth) return action();
    const before = this._pendingBefore || snapshot(this.Layout);
    this._registerContents(); this._depth++;
    try {
      const result = action();
      if (result && typeof result.then === 'function') throw new TypeError('Layout transactions must be synchronous');
      this._normalize(); this._depth--; this._commit(before, label); return result;
    } catch (error) {
      this._depth = 0; this._suspended++;
      try { this._replaceLayout(hydrate(before, this._registry)); this._pendingBefore = null; }
      finally { this._suspended--; }
      this._view?.requestRender(); throw error;
    }
  }
  BeginUpdate() {
    if (this._depth === 0) this._pendingBefore ||= snapshot(this.Layout);
    this._depth++; let done = false;
    return { Dispose: () => { if (!done) { done = true; this.EndUpdate(); } } };
  }
  EndUpdate() {
    if (!this._depth) throw new Error('EndUpdate has no matching BeginUpdate');
    if (--this._depth === 0) { this._normalize(); this._commit(this._pendingBefore, 'Batch update'); }
  }
  Undo() {
    if (!this.CanUndo) return false;
    const entry = this._undo.pop(); this._redo.push(entry); this._restoreHistory(entry.before);
    this._emit('HistoryChanged', { CanUndo: this.CanUndo, CanRedo: this.CanRedo, Label: entry.label }); return true;
  }
  Redo() {
    if (!this.CanRedo) return false;
    const entry = this._redo.pop(); this._undo.push(entry); this._restoreHistory(entry.after);
    this._emit('HistoryChanged', { CanUndo: this.CanUndo, CanRedo: this.CanRedo, Label: entry.label }); return true;
  }
  _restoreHistory(state) {
    this._suspended++;
    try { this._replaceLayout(hydrate(state, this._registry)); this._normalize(); }
    finally { this._suspended--; }
    this._commit(null, 'Restore history');
  }
  ClearHistory() { this._undo = []; this._redo = []; this._emit('HistoryChanged', { CanUndo: this.CanUndo, CanRedo: this.CanRedo }); }
  Find(contentId) { return contents(this.Layout).find(x => x.ContentId === contentId) || null; }
  FindById(id) { return [this.Layout, ...this.Layout.Descendents()].find(x => x.Id === id) || null; }
  GetLayoutItemFromModel(model) {
    if (!(model instanceof LayoutContent)) throw new TypeError('Expected LayoutContent');
    let item = this._items.get(model);
    if (!item) { item = model instanceof LayoutAnchorable ? new LayoutAnchorableItem(this, model) : new LayoutDocumentItem(this, model); this._items.set(model, item); }
    return item;
  }
  CreateUIElementForModel(model) { return this._view?.controlFor(model) || null; }
  Activate(value) {
    let model = value instanceof LayoutContent ? value : contents(this.Layout).find(c => c.Content === value || c.ContentId === value) || null;
    if (value != null && !model) throw new Error('Active content does not belong to this layout');
    if (model && (model.Root !== this.Layout || !model.IsEnabled)) return false;
    if (model?.IsHidden) this.Show(model);
    this._activate(model, true);
    if (model?.IsAutoHidden) this.ShowAutoHideWindow(model);
    this._view?.requestRender(); return true;
  }
  _activate(model, notify = true) {
    const old = this.Layout._activeContent;
    if (old === model) { if (model) model.IsSelected = true; return; }
    old?._setActive(false); this.Layout._activeContent = model;
    model?._setActive(true);
    if (model) {
      this._mru = [model.ContentId, ...this._mru.filter(x => x !== model.ContentId)];
      if (model instanceof LayoutDocument || model.Parent instanceof LayoutDocumentPane) this.Layout._lastFocusedDocument = model;
      const floating = model.FindParent(LayoutFloatingWindow);
      if (floating) floating._values.ZIndex = Math.max(1, ...this.Layout.FloatingWindows.map(x => x.ZIndex)) + 1;
    }
    if (notify) this._emit('ActiveContentChanged', { OldContent: old?.Content ?? null, Content: model?.Content ?? null, Model: model });
  }
  _documentPane() {
    const focused = this.Layout.LastFocusedDocument?.Parent;
    return focused instanceof LayoutDocumentPane && !focused.FindParent(LayoutFloatingWindow) ? focused
      : [...this.Layout.RootPanel.Descendents()].find(x => x instanceof LayoutDocumentPane) || null;
  }
  _remember(model) {
    if (!model.Parent || model.IsHidden || model.IsAutoHidden || model.IsFloating) return;
    const parent = model.Parent;
    model.PreviousContainer = parent;
    model.PreviousContainerIndex = parent.IndexOf?.(model) ?? 0;
    model._return = { paneId: parent.Id, index: model.PreviousContainerIndex, side: this._sideFor(parent), kind: parent instanceof LayoutDocumentPane ? 'document' : 'anchorable' };
  }
  _sideFor(node) {
    for (let item = node; item && item.Parent && item.Parent !== this.Layout; item = item.Parent) {
      const parent = item.Parent;
      if (parent instanceof LayoutPanel || parent instanceof LayoutAnchorablePaneGroup) {
        const index = parent.Children.IndexOf(item);
        if (parent.Children.Count > 1) return parent.Orientation === 'Vertical' ? (index === 0 ? 'Top' : 'Bottom') : (index === 0 ? 'Left' : 'Right');
      }
    }
    return 'Right';
  }
  _subjectItems(subject) { return subject instanceof LayoutContent ? [subject] : subject?.Descendents ? contents(subject) : []; }
  AddDocument(document, pane = null) {
    if (!(document instanceof LayoutDocument)) document = new LayoutDocument(document);
    return this.Transaction('Add document', () => {
      this._assertUnique(document);
      pane ||= this._documentPane();
      const handled = this.LayoutUpdateStrategy?.BeforeInsertDocument?.(this.Layout, document, pane);
      if (!handled) { if (!pane) { pane = new LayoutDocumentPane(); this.Layout.RootPanel.Children.Add(pane); } pane.Children.Add(document); }
      if (document.Root !== this.Layout) throw new Error('BeforeInsertDocument returned true without inserting the document');
      this.LayoutUpdateStrategy?.AfterInsertDocument?.(this.Layout, document);
      this.Activate(document); return document;
    });
  }
  AddAnchorable(anchorable, strategy = AnchorableShowStrategy.Most) {
    if (!(anchorable instanceof LayoutAnchorable)) anchorable = new LayoutAnchorable(anchorable);
    return this.Transaction('Add tool window', () => {
      this._assertUnique(anchorable);
      let side = typeof strategy === 'string' ? strategy : (strategy & 2 ? 'Left' : strategy & 4 ? 'Right' : strategy & 16 ? 'Top' : strategy & 32 ? 'Bottom' : null);
      let pane = [...this.Layout.RootPanel.Descendents()].find(x => x instanceof LayoutAnchorablePane && (!side || this._sideFor(x) === side));
      const handled = this.LayoutUpdateStrategy?.BeforeInsertAnchorable?.(this.Layout, anchorable, pane || null);
      if (!handled) {
        if (pane) pane.Children.Add(anchorable);
        else this._dockRoot([anchorable], side || 'Right');
      }
      if (anchorable.Root !== this.Layout) throw new Error('BeforeInsertAnchorable returned true without inserting the anchorable');
      this.LayoutUpdateStrategy?.AfterInsertAnchorable?.(this.Layout, anchorable);
      this.Activate(anchorable); return anchorable;
    });
  }
  _assertUnique(model) {
    if (model.Manager && model.Manager !== this) throw new Error('Use TransferTo to move content between managers');
    for (const incoming of this._subjectItems(model)) {
      if (incoming.ContentId) {
        const existing = this.Find(incoming.ContentId);
        if (existing && existing !== incoming) throw new Error(`Duplicate ContentId: ${incoming.ContentId}`);
      }
    }
  }
  Float(subject, bounds = {}) {
    const list = this._subjectItems(subject);
    if (!list.length || !list.every(x => x.Root === this.Layout && x.CanFloat && x.CanMove && x.IsEnabled)) return false;
    if (subject instanceof LayoutDocumentPane || subject instanceof LayoutDocumentPaneGroup) return false;
    return this.Transaction('Float window', () => {
      if (subject instanceof LayoutFloatingWindow) {
        for (const name of ['FloatingLeft','FloatingTop','FloatingWidth','FloatingHeight']) if (bounds[name] != null) subject[name] = bounds[name];
        return subject;
      }
      for (const item of list) this._remember(item);
      const seed = list[0];
      const metrics = Object.fromEntries(['FloatingLeft','FloatingTop','FloatingWidth','FloatingHeight'].map(key => [key, bounds[key] ?? seed[key]]));
      metrics.FloatingWidth = Math.max(this.FloatingWindowMinWidth, metrics.FloatingWidth || 480);
      metrics.FloatingHeight = Math.max(this.FloatingWindowMinHeight, metrics.FloatingHeight || 320);
      let floating;
      if (subject instanceof LayoutDocument) floating = new LayoutDocumentFloatingWindow({ ...metrics, RootDocument: subject });
      else {
        let panel;
        if (subject instanceof LayoutAnchorablePaneGroup) panel = this._copyFloatingGroup(subject);
        else if (subject instanceof LayoutAnchorablePane) panel = new LayoutAnchorablePaneGroup({ Children: [this._copyFloatingGroup(subject)] });
        else panel = new LayoutAnchorablePaneGroup({ Children: [new LayoutAnchorablePane({ Children: list })] });
        floating = new LayoutAnchorableFloatingWindow({ ...metrics, RootPanel: panel });
      }
      this.Layout.FloatingWindows.Add(floating);
      this._autoHideModel = null; this.Activate(seed);
      this._emit('LayoutFloatingWindowControlCreated', { Model: floating });
      this._emit('ContentMoved', { Contents: list, Operation: 'Float' });
      return floating;
    });
  }
  _copyFloatingGroup(source) {
    // Keep the original panes as hidden return anchors. Content nodes are moved,
    // never cloned, so each item still has an unambiguous dock-back location.
    const options = {};
    for (const key of Object.keys(getSchema(source.constructor))) if (key !== 'Id' && !key.startsWith('Actual')) options[key] = source[key];
    options.Children = source instanceof LayoutAnchorablePane ? [...source.Children] : [...source.Children].map(child => this._copyFloatingGroup(child));
    return new source.constructor(options);
  }
  CanDockAt(subject, target, position = 'Center') {
    const list = this._subjectItems(subject);
    if (!list.length || !list.every(x => x.CanDock && x.CanMove && x.IsEnabled && (!x.Manager || x.Manager === this))) return false;
    if (!['Center','Left','Right','Top','Bottom'].includes(position)) return false;
    if (target === this.Layout || target === this.Layout.RootPanel) return position !== 'Center' && list.every(x => x instanceof LayoutAnchorable);
    if (!(target instanceof LayoutPane) || target.Root !== this.Layout) return false;
    if (list.includes(target) || target === subject || (subject?.Descendents && [...subject.Descendents()].includes(target))) return false;
    if (target instanceof LayoutAnchorablePane && list.some(x => !(x instanceof LayoutAnchorable))) return false;
    if (target instanceof LayoutDocumentPane && list.some(x => x instanceof LayoutAnchorable && !x.CanDockAsTabbedDocument)) return false;
    if (position === 'Center' && list.every(x => x.Parent === target) && !target.CanRepositionItems) return false;
    if (position !== 'Center' && target instanceof LayoutDocumentPane && target.Parent instanceof LayoutDocumentPaneGroup && !this.AllowMixedOrientation) {
      const orientation = ['Left','Right'].includes(position) ? 'Horizontal' : 'Vertical';
      if (target.Parent.Orientation !== orientation && target.Parent.ChildrenCount > 1) return false;
    }
    return true;
  }
  Dock(subject, target = null, position = 'Center', index = null) {
    const list = this._subjectItems(subject);
    if (!list.length || !list.every(x => x.CanDock && x.CanMove && x.IsEnabled && (!x.Manager || x.Manager === this))) return false;
    if (target) {
      if (!this.CanDockAt(subject, target, position)) return false;
      return this.Transaction(`Dock ${position.toLowerCase()}`, () => {
        let pane;
        if (target === this.Layout || target === this.Layout.RootPanel) pane = this._dockRoot(list, position, subject);
        else if (position === 'Center') {
          pane = target; let insertion = index == null ? target.Children.Count : Math.max(0, Math.min(target.Children.Count, index));
          for (const item of list) {
            const oldIndex = item.Parent === target ? target.IndexOf(item) : -1;
            if (oldIndex >= 0) { target.Children.Remove(item); if (oldIndex < insertion) insertion--; }
            target.Children.Insert(Math.min(insertion++, target.Children.Count), item);
          }
        } else {
          const Type = target instanceof LayoutDocumentPane ? LayoutDocumentPane : LayoutAnchorablePane;
          pane = new Type({ Children: list }); this._split(target, pane, position);
        }
        this._autoHideModel = null; this.Activate(list[0]); this._pruneEmptyPanes();
        this._emit('ContentMoved', { Contents: list, Target: pane, Position: position, Operation: 'Dock' }); return pane;
      });
    }
    return this.Transaction('Dock window', () => {
      for (const item of list) this._restoreItem(item);
      this.Activate(list[0]); this._pruneEmptyPanes(); this._autoHideModel = null;
      this._emit('ContentMoved', { Contents: list, Operation: 'Dock' }); return true;
    });
  }
  _restoreItem(item) {
    let pane = item.PreviousContainer?.Root === this.Layout ? item.PreviousContainer : this.FindById(item.PreviousContainerId || item._return?.paneId);
    if (!(pane instanceof LayoutPane) || pane.FindParent(LayoutFloatingWindow)) pane = null;
    if (item instanceof LayoutDocument && !(pane instanceof LayoutDocumentPane)) pane = null;
    if (!pane) {
      if (item instanceof LayoutDocument || item._return?.kind === 'document') pane = this._documentPane();
      else pane = this._dockRoot([], item._return?.side || 'Right');
    }
    if (!pane) { pane = new LayoutDocumentPane(); this.Layout.RootPanel.Children.Add(pane); }
    const index = Math.min(pane.Children.Count, Math.max(0, item.PreviousContainerIndex));
    pane.Children.Insert(index, item); return pane;
  }
  _split(target, pane, side) {
    const orientation = ['Left','Right'].includes(side) ? 'Horizontal' : 'Vertical';
    const before = side === 'Left' || side === 'Top';
    const parent = target.Parent;
    if (!parent?.Children?.Insert) throw new Error('The target pane is not in a splittable group');
    const compatible = parent instanceof LayoutPanel || (parent instanceof LayoutDocumentPaneGroup && pane instanceof LayoutDocumentPane) || (parent instanceof LayoutAnchorablePaneGroup && pane instanceof LayoutAnchorablePane);
    if (compatible && parent.Orientation === orientation) {
      parent.Children.Insert(parent.Children.IndexOf(target) + (before ? 0 : 1), pane);
      const key = orientation === 'Horizontal' ? 'DockWidth' : 'DockHeight';
      const size = target[key];
      if (size.IsStar) { target[key] = `${Math.max(.01, size.Value / 2)}*`; pane[key] = target[key]; }
      else { target[key] = Math.max(80, size.Value / 2); pane[key] = target[key]; }
    } else {
      const Group = target instanceof LayoutDocumentPane && pane instanceof LayoutDocumentPane ? LayoutDocumentPaneGroup : target instanceof LayoutAnchorablePane && pane instanceof LayoutAnchorablePane ? LayoutAnchorablePaneGroup : LayoutPanel;
      const group = new Group({ Orientation: orientation, DockWidth: target.DockWidth, DockHeight: target.DockHeight });
      parent.ReplaceChild(target, group);
      target.DockWidth = '1*'; target.DockHeight = '1*'; pane.DockWidth = '1*'; pane.DockHeight = '1*';
      group.Children.AddRange(before ? [pane, target] : [target, pane]);
    }
  }
  _dockRoot(list, side, subject = null) {
    if (!['Left','Right','Top','Bottom'].includes(side)) throw new TypeError('Invalid docking side');
    if (!list.every(x => x instanceof LayoutAnchorable)) throw new TypeError('Only anchorables dock at manager edges');
    const orientation = ['Left','Right'].includes(side) ? 'Horizontal' : 'Vertical', before = side === 'Left' || side === 'Top';
    let insert;
    if (subject instanceof LayoutAnchorablePaneGroup) insert = subject;
    else if (subject instanceof LayoutAnchorableFloatingWindow && subject.RootPanel) insert = subject.RootPanel;
    else insert = new LayoutAnchorablePane({ Children: list });
    insert.DockWidth = orientation === 'Horizontal' ? 260 : '1*';
    insert.DockHeight = orientation === 'Vertical' ? 210 : '1*';
    let root = this.Layout.RootPanel;
    if (root.Orientation !== orientation && root.ChildrenCount > 1) {
      const old = root; root = new LayoutPanel({ Orientation: orientation });
      this.Layout.RootPanel = root; root.Children.Add(old);
    } else root.Orientation = orientation;
    root.Children.Insert(before ? 0 : root.Children.Count, insert);
    return insert instanceof LayoutPane ? insert : [...insert.Descendents()].find(x => x instanceof LayoutPane);
  }
  DockAsDocument(item) {
    if (!(item instanceof LayoutContent) || item instanceof LayoutAnchorable && !item.CanDockAsTabbedDocument) return false;
    const pane = this._documentPane(); return pane ? this.Dock(item, pane, 'Center') : false;
  }
  NewTabGroup(item, orientation = 'Horizontal') {
    if (!(item?.Parent instanceof LayoutDocumentPane) || item.Parent.Children.Count < 2) return false;
    return this.Dock(item, item.Parent, orientation === 'Horizontal' ? 'Bottom' : 'Right');
  }
  MoveToTabGroup(item, direction = 1) {
    const panes = [...this.Layout.RootPanel.Descendents()].filter(x => x instanceof LayoutDocumentPane);
    const target = panes[panes.indexOf(item.Parent) + direction];
    return target ? this.Dock(item, target) : false;
  }
  _pruneEmptyPanes() {
    const protectedIds = new Set(contents(this.Layout).filter(x => x.IsFloating || x.IsAutoHidden || x.IsHidden).map(x => x.PreviousContainerId));
    const docs = [...this.Layout.RootPanel.Descendents()].filter(x => x instanceof LayoutDocumentPane);
    let count = docs.length;
    for (const pane of docs) if (!pane.Children.Count && count > 1 && !protectedIds.has(pane.Id)) { pane.Parent.RemoveChild(pane); count--; }
    this.Layout.CollectGarbage();
  }
  Hide(item, cancelable = true) {
    if (!(item instanceof LayoutAnchorable) || !item.CanHide || item.IsHidden || item.Root !== this.Layout) return false;
    const args = new CancelEventArgs({ Model: item, Anchorable: item });
    if (cancelable) { item.Hiding.emit(item, args); this._emit('AnchorableHiding', args); if (args.Cancel) return false; }
    return this.Transaction('Hide tool window', () => {
      this._remember(item); this.Layout.Hidden.Add(item);
      if (this._autoHideModel === item) this._autoHideModel = null;
      item.IsVisibleChanged.emit(item, { IsVisible: false });
      this._emit('AnchorableHidden', { Anchorable: item }); return true;
    });
  }
  Show(item) {
    if (!(item instanceof LayoutAnchorable) || item.Root !== this.Layout) return false;
    if (!item.IsHidden) { this.Activate(item); return true; }
    return this.Transaction('Show tool window', () => {
      this._restoreItem(item); item.IsVisibleChanged.emit(item, { IsVisible: true }); this.Activate(item); return true;
    });
  }
  ToggleAutoHide(subject) {
    const group = subject instanceof LayoutAnchorGroup ? subject : subject?.IsAutoHidden ? subject.Parent : null;
    if (group) {
      const list = [...group.Children];
      if (group.Root !== this.Layout || !list.every(item => item.CanAutoHide && item.IsEnabled)) return false;
      return this.Transaction('Pin tool window', () => {
        for (const item of list) { this._restoreItem(item); item.IsAutoHiddenChanged.emit(item, { IsAutoHidden: false }); }
        this._autoHideModel = null; if (list[0]) this.Activate(list[0]); return true;
      });
    }
    const pane = subject instanceof LayoutAnchorablePane ? subject : subject?.Parent;
    if (!(pane instanceof LayoutAnchorablePane) || pane.FindParent(LayoutFloatingWindow) || !pane.Children.Count || !pane.Children.every(x => x.CanAutoHide && x.IsEnabled)) return false;
    return this.Transaction('Auto-hide tool group', () => {
      const side = this._sideFor(pane), list = [...pane.Children];
      const anchorGroup = new LayoutAnchorGroup({ PreviousContainer: pane, PreviousContainerId: pane.Id });
      for (const item of list) this._remember(item);
      this.Layout[`${side}Side`].Children.Add(anchorGroup);
      for (const item of list) { anchorGroup.Children.Add(item); item.IsAutoHiddenChanged.emit(item, { IsAutoHidden: true }); }
      if (list.includes(this.ActiveModel)) this._activate(null, true);
      this._autoHideModel = null; return true;
    });
  }
  ShowAutoHideWindow(item) {
    if (!(item instanceof LayoutAnchorable) || !item.IsAutoHidden || !item.IsEnabled) return false;
    this._autoHideModel = item; this._view?.requestRender(); return true;
  }
  HideAutoHideWindow() { this._autoHideModel = null; this._view?.requestRender(); }
  _approveClose(item) {
    if (!(item instanceof LayoutContent) || !item.CanClose || item.Root !== this.Layout) return false;
    const args = new CancelEventArgs({ Model: item, Document: item instanceof LayoutDocument ? item : undefined, Anchorable: item instanceof LayoutAnchorable ? item : undefined });
    item.Closing.emit(item, args);
    this._emit(item instanceof LayoutDocument ? 'DocumentClosing' : 'AnchorableClosing', args); return !args.Cancel;
  }
  _removeClosed(item) {
    this._registry.set(item.ContentId, item); item.Parent?.RemoveChild(item);
    if (this._autoHideModel === item) this._autoHideModel = null;
    item._setActive(false); this._removeFromSource(item);
    item.Closed.emit(item, {});
    this._emit(item instanceof LayoutDocument ? 'DocumentClosed' : 'AnchorableClosed', { Model: item, Document: item instanceof LayoutDocument ? item : undefined, Anchorable: item instanceof LayoutAnchorable ? item : undefined });
  }
  Close(item) {
    if (!this._approveClose(item)) return false;
    return this.Transaction('Close content', () => { this._removeClosed(item); this._pruneEmptyPanes(); return true; });
  }
  CloseAll(except = null, pane = null) {
    const list = pane ? [...pane.Children] : contents(this.Layout).filter(x => x instanceof LayoutDocument);
    let closed = 0;
    this.Transaction('Close documents', () => { for (const item of list) if (item !== except && this.Close(item)) closed++; }); return closed;
  }
  CloseFloatingWindow(floating) {
    const list = contents(floating), actions = [];
    for (const item of list) {
      if (item instanceof LayoutAnchorable && item.CanHide) {
        const args = new CancelEventArgs({ Model: item, Anchorable: item }); item.Hiding.emit(item, args); this._emit('AnchorableHiding', args);
        if (args.Cancel) return false; actions.push([item, 'hide']);
      } else { if (!this._approveClose(item)) return false; actions.push([item, 'close']); }
    }
    return this.Transaction('Close floating window', () => {
      for (const [item, action] of actions) { if (action === 'hide') this.Hide(item, false); else this._removeClosed(item); }
      this.Layout.FloatingWindows.Remove(floating); this._emit('LayoutFloatingWindowControlClosed', { Model: floating }); return true;
    });
  }
  PopOut(item) { return this._view?.popOut(item) || null; }
  FocusNextPane(reverse = false) {
    const panes = [...this.Layout.Descendents()].filter(x => x instanceof LayoutPane && x.ChildrenCount && x.IsVisible);
    if (!panes.length) return;
    let index = panes.indexOf(this.ActiveModel?.Parent); index = (index + (reverse ? -1 : 1) + panes.length) % panes.length;
    this.Activate(panes[index].SelectedContent || panes[index].Children[0]); this._view?.focusContent(this.ActiveModel);
  }
  ShowNavigator() { this._view?.showNavigator(); }
  ShowMenu(entries, x, y, title) { this._view?.showMenu(entries, x, y, title); }
  ShowContextMenu(model, x, y) { this._view?.openContextMenu(model, x, y); }
  SaveLayout(format = 'json') { return format.toLowerCase() === 'xml' ? new XmlLayoutSerializer(this).Serialize() : new JsonLayoutSerializer(this).Serialize(); }
  LoadLayout(text, format = null) {
    format ||= typeof text === 'string' && text.trimStart().startsWith('<') ? 'xml' : 'json';
    return format === 'xml' ? new XmlLayoutSerializer(this).Deserialize(text) : new JsonLayoutSerializer(this).Deserialize(text);
  }
  SaveToStorage(key = this.StorageKey) {
    if (!key) return false;
    try { if (typeof localStorage === 'undefined') return false; localStorage.setItem(key, this.SaveLayout()); return true; }
    catch (error) { this._emit('Error', { Error: error, Operation: 'Save storage' }); return false; }
  }
  LoadFromStorage(key = this.StorageKey) {
    if (!key) return false;
    try { if (typeof localStorage === 'undefined') return false; const value = localStorage.getItem(key); if (!value) return false; this.LoadLayout(value); return true; }
    catch (error) { this._emit('Error', { Error: error, Operation: 'Load storage' }); return false; }
  }
  ReleaseContent(contentId) {
    if (this.Find(contentId)) return false;
    this._registry.delete(contentId); for (const [model,item] of this._items) if (model.ContentId === contentId) { item.Dispose(); this._items.delete(model); } this._view?.releaseContent(contentId); return true;
  }
  _bindSource(kind, source) {
    if (source != null && !source[Symbol.iterator]) throw new TypeError('A source must be iterable');
    const old = this._sources.get(kind); old?.unsubscribe?.();
    if (old) this.Transaction('Replace source', () => { for (const model of old.map.values()) if (model.Root === this.Layout) model.Parent.RemoveChild(model); });
    const binding = { source, map: new Map(), unsubscribe: null };
    this._sources.set(kind, binding);
    if (source?.CollectionChanged instanceof EventSignal) binding.unsubscribe = source.CollectionChanged.add(() => this._syncSource(kind));
    this._syncSource(kind);
  }
  RefreshSources() { for (const kind of this._sources.keys()) this._syncSource(kind); }
  _syncSource(kind) {
    const binding = this._sources.get(kind); if (!binding || binding.syncing) return;
    binding.syncing = true;
    const previousMap = new Map(binding.map);
    try {
      this.Transaction('Synchronize source', () => {
        const values = [...(binding.source || [])];
        if (new Set(values).size !== values.length) throw new Error('Source entries must have distinct identities');
        for (const [value, original] of binding.map) if (!values.includes(value)) {
          const model = this.Find(original.ContentId) || original;
          if (model.Root === this.Layout) model.Parent.RemoveChild(model); binding.map.delete(value);
        }
        for (const value of values) {
          if (binding.map.has(value)) {
            const original = binding.map.get(value), live = this.Find(original.ContentId);
            if (live) {
              binding.map.set(value, live);
              if (!(value instanceof LayoutContent)) {
                const title = value?.Title ?? value?.title ?? value?.name;
                if (title != null) live.Title = String(title);
                const style = this.LayoutItemContainerStyleSelector?.SelectStyle?.(value, live) || (typeof this.LayoutItemContainerStyleSelector === 'function' ? this.LayoutItemContainerStyleSelector(value, live) : null) || this.LayoutItemContainerStyle;
                if (style && typeof style === 'object') for (const [key, setting] of Object.entries(style)) if (key in live) live[key] = typeof setting === 'function' ? setting(value, live) : setting;
              }
            }
            continue;
          }
          const Type = kind === 'document' ? LayoutDocument : LayoutAnchorable;
          const model = value instanceof Type ? value : new Type({
            ContentId: String(value?.ContentId ?? value?.id ?? uid(kind)), Title: String(value?.Title ?? value?.title ?? value?.name ?? value), Content: value
          });
          const style = this.LayoutItemContainerStyleSelector?.SelectStyle?.(value, model) || (typeof this.LayoutItemContainerStyleSelector === 'function' ? this.LayoutItemContainerStyleSelector(value, model) : null) || this.LayoutItemContainerStyle;
          if (style && typeof style === 'object') for (const [key, setting] of Object.entries(style)) if (key in model) model[key] = typeof setting === 'function' ? setting(value, model) : setting;
          binding.map.set(value, model);
          if (kind === 'document') this.AddDocument(model); else this.AddAnchorable(model);
        }
      });
    } catch (error) { binding.map = previousMap; throw error; } finally { binding.syncing = false; }
  }
  _removeFromSource(item) {
    for (const binding of this._sources.values()) for (const [value, model] of binding.map) if (model.ContentId === item.ContentId) {
      binding.syncing = true;
      try {
        if (binding.source instanceof ObservableCollection) binding.source.Remove(value);
        else if (Array.isArray(binding.source)) { const i = binding.source.indexOf(value); if (i >= 0) binding.source.splice(i, 1); }
        binding.map.delete(value);
      } finally { binding.syncing = false; }
    }
  }
  TransferTo(destination, item, target = null, position = 'Center') {
    if (!(destination instanceof DockingManager) || destination === this || item.Root !== this.Layout) return false;
    if (!item.CanMove || !item.CanDock || destination.Find(item.ContentId)) return false;
    const a = snapshot(this.Layout), b = snapshot(destination.Layout);
    this._depth++; destination._depth++;
    try {
      item.Parent.RemoveChild(item); item.PreviousContainer = null; item._return = null;
      destination._registry.set(item.ContentId, item);
      let result;
      if (target) result = destination.Dock(item, target, position);
      else result = item instanceof LayoutDocument ? destination.AddDocument(item) : destination.AddAnchorable(item);
      if (!result) throw new Error('Destination rejected the transfer');
      this._normalize(); destination._normalize();
      this._depth--; destination._depth--;
      this._commit(a, 'Transfer content'); destination._commit(b, 'Receive content'); return true;
    } catch (error) {
      this._depth--; destination._depth--;
      this._restoreHistory(a); destination._restoreHistory(b); throw error;
    }
  }
}
properties(DockingManager, {
  AllowMixedOrientation: { default: false, coerce: boolean }, Theme: { default: 'dark' },
  GridSplitterWidth: { default: 5, coerce: positive }, GridSplitterHeight: { default: 5, coerce: positive },
  FloatingWindowMinWidth: { default: 220, coerce: positive }, FloatingWindowMinHeight: { default: 140, coerce: positive },
  ShowSystemMenu: { default: true, coerce: boolean }, AllowKeyboardNavigation: { default: true, coerce: boolean },
  AutoHideDelay: { default: 350, coerce: positive }, AutoHideCloseDelay: { default: 500, coerce: positive },
  EnableHistory: { default: true, coerce: boolean }, HistoryLimit: { default: 100, coerce: positive },
  StorageKey: { default: null }, AutoSave: { default: true, coerce: boolean }, RestoreOnLoad: { default: true, coerce: boolean },
  FlowDirection: { default: 'LeftToRight', validate: x => ['LeftToRight','RightToLeft'].includes(x) },
  LayoutUpdateStrategy: { default: null },
  LayoutItemTemplate: { default: null }, LayoutItemTemplateSelector: { default: null },
  DocumentHeaderTemplate: { default: null }, DocumentHeaderTemplateSelector: { default: null },
  AnchorableHeaderTemplate: { default: null }, AnchorableHeaderTemplateSelector: { default: null },
  DocumentTitleTemplate: { default: null }, DocumentTitleTemplateSelector: { default: null },
  AnchorableTitleTemplate: { default: null }, AnchorableTitleTemplateSelector: { default: null },
  DocumentPaneMenuItemHeaderTemplate: { default: null }, DocumentPaneMenuItemHeaderTemplateSelector: { default: null },
  IconContentTemplate: { default: null }, IconContentTemplateSelector: { default: null },
  DocumentPaneTemplate: { default: null }, AnchorablePaneTemplate: { default: null },
  AnchorGroupTemplate: { default: null }, AnchorSideTemplate: { default: null }, AnchorTemplate: { default: null },
  DocumentPaneControlStyle: { default: null }, AnchorablePaneControlStyle: { default: null },
  LayoutItemContainerStyle: { default: null }, LayoutItemContainerStyleSelector: { default: null },
  DocumentContextMenu: { default: null }, AnchorableContextMenu: { default: null },
  Strings: { default: null }
});
for (const key of ['Layout','ActiveContent','DocumentsSource','AnchorablesSource']) Object.defineProperty(DockingManager, `${key}Property`, { value: Object.freeze({ Name: key, OwnerType: 'DockingManager' }) });

__exports.DockingManager=DockingManager;
},
"view.js":function(__exports,__require){
const { GridLength }=__require("events.js");
const { LayoutRoot, LayoutPanel, LayoutContent, LayoutDocument, LayoutAnchorable, LayoutPane, LayoutDocumentPane, LayoutAnchorablePane, LayoutDocumentPaneGroup, LayoutAnchorablePaneGroup, LayoutAnchorSide, LayoutAnchorGroup, LayoutFloatingWindow, LayoutDocumentFloatingWindow, contents }=__require("model.js");
const { element, icon, button, syncChildren, moveNode, clamp, rectRelative, applyStyle, selectTemplate }=__require("dom.js");
const { controlFor }=__require("controls.js");

const SIDES = ['Left','Top','Right','Bottom'];
class DockRenderer {
  constructor(manager, host) {
    this.manager = manager; this.host = host; this.doc = host.ownerDocument; this.win = this.doc.defaultView;
    this.abort = new this.win.AbortController(); this.records = new Map(); this.contentRecords = new Map(); this.tabs = new Map(); this.splitters = new Map();
    this.popups = new Map(); this.sideElements = {}; this.frame = 0; this.rendering = false; this.disposed = false;
    this._originalNodes = [...host.childNodes]; this._oldClass = host.className; this._oldTabIndex = host.getAttribute('tabindex'); this._oldRole = host.getAttribute('role');
    host.classList.add('ad-manager'); host.tabIndex = 0; host.setAttribute('role', 'region'); host.setAttribute('aria-label', 'Docking workspace');
    this.stage = element(this.doc, 'div', 'ad-stage');
    this.workspace = element(this.doc, 'div', 'ad-workspace');
    for (const side of SIDES) {
      const rail = element(this.doc, 'div', `ad-side ad-side-${side.toLowerCase()}`);
      rail.setAttribute('aria-label', `${side} auto-hidden tools`); this.sideElements[side] = rail; this.stage.append(rail);
    }
    this.stage.append(this.workspace);
    this.floatingLayer = element(this.doc, 'div', 'ad-floating-layer');
    this.overlay = element(this.doc, 'div', 'ad-drag-overlay'); this.overlay.setAttribute('aria-hidden', 'true');
    this.parking = element(this.doc, 'div', 'ad-parking'); this.parking.hidden = true;
    this.live = element(this.doc, 'div', 'ad-live'); this.live.setAttribute('aria-live', 'polite'); this.live.setAttribute('aria-atomic','true');
    host.replaceChildren(this.stage, this.floatingLayer, this.overlay, this.parking, this.live);
    const opts = { signal: this.abort.signal };
    host.addEventListener('keydown', event => this.onKeyDown(event), opts);
    host.addEventListener('keyup', event => this.onKeyUp(event), opts);
    host.addEventListener('focusin', event => {
      const content = event.target.closest?.('[data-ad-content]');
      if (content && host.contains(content)) { const model = manager.Find(content.dataset.adContent); if (model && !model.IsActive) manager.Activate(model); }
    }, opts);
    this.doc.addEventListener('pointerdown', event => {
      if (this.menu && !this.menu.contains(event.target)) this.closeMenu();
      if (manager._autoHideModel && !this.peek?.contains(event.target) && !event.target.closest?.('.ad-anchor-tab')) manager.HideAutoHideWindow();
    }, opts);
    this.win.addEventListener('blur', () => this.cancelInteraction(), opts);
    this.resizeObserver = new this.win.ResizeObserver(() => { if (!this.interaction) this.requestRender(); }); this.resizeObserver.observe(host);
  }
  requestRender() {
    if (this.disposed || this.frame) return;
    this.frame = this.win.requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }
  invalidateTemplates() { for (const rec of this.contentRecords.values()) rec.template = Symbol('invalid'); this.requestRender(); }
  render() {
    if (this.disposed || this.rendering) return;
    this.rendering = true;
    const active = this.doc.activeElement;
    const selection = active && 'selectionStart' in active ? { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection } : null;
    const start = this.win.performance.now();
    try {
      const theme = this.manager.Theme; this.host.dataset.theme = typeof theme === 'string' ? theme : theme?.Name || 'dark';
      this.host.dir = this.manager.FlowDirection === 'RightToLeft' ? 'rtl' : 'ltr';
      this.host.style.setProperty('--ad-splitter-width', `${this.manager.GridSplitterWidth}px`);
      this.host.style.setProperty('--ad-splitter-height', `${this.manager.GridSplitterHeight}px`);
      const variables = Object.fromEntries(Object.entries(theme?.Variables || {}).map(([key,value]) => [key.startsWith('--') ? key : `--ad-${key}`, value]));
      for (const key of this.themeVariableKeys || []) if (!(key in variables)) this.host.style.removeProperty(key);
      for (const [key,value] of Object.entries(variables)) this.host.style.setProperty(key, value);
      this.themeVariableKeys = Object.keys(variables);
      this.usedRecords = new Set(); this.usedTabs = new Set(); this.usedSplitters = new Set(); this.visibleContents = new Set();
      const root = this.renderNode(this.manager.Layout.RootPanel); this.sync(this.workspace, [root]);
      this.renderSides();
      const floating = [];
      for (const model of this.manager.Layout.FloatingWindows) {
        const popup = this.popups.get(model.Id);
        if (popup && !popup.window.closed) { this.renderPopup(model, popup); continue; }
        floating.push(this.renderFloating(model));
      }
      this.sync(this.floatingLayer, floating);
      this.renderPeek();
      for (const [id, rec] of this.contentRecords) {
        if (!this.visibleContents.has(id)) {
          rec.el.hidden = true;
          // Keep hidden content alive and connected; factories are disposed only on explicit release.
          if (!rec.el.isConnected || !this.host.contains(rec.el)) moveNode(this.parking, rec.el);
        }
      }
      for (const [id, record] of this.records) if (!this.usedRecords.has(id)) {
        for (const rec of this.contentRecords.values()) if (record.el.contains(rec.el)) moveNode(this.parking, rec.el);
        record.el.remove(); this.records.delete(id);
      }
      for (const [id, tab] of this.tabs) if (!this.usedTabs.has(id)) { tab.el.remove(); this.tabs.delete(id); }
      for (const [id, splitter] of this.splitters) if (!this.usedSplitters.has(id)) { splitter.el.remove(); this.splitters.delete(id); }
      for (const [id, popup] of this.popups) if (!this.manager.FindById(id)) this.closePopup(id);
      for (const rec of this.records.values()) {
        if ('ActualWidth' in rec.model) { const rect = rec.el.getBoundingClientRect(); rec.model._values.ActualWidth = rect.width; rec.model._values.ActualHeight = rect.height; }
      }
      if (active?.isConnected && this.doc.activeElement !== active && this.host.contains(active)) {
        try { active.focus({ preventScroll: true }); if (selection && selection.start != null) active.setSelectionRange(selection.start, selection.end, selection.direction); } catch { /* Not all editable elements expose text selection. */ }
      }
    } finally { this.rendering = false; this.lastRenderTime = this.win.performance.now() - start; }
  }
  parkContentIn(node) {
    if (!node) return;
    for (const rec of this.contentRecords.values()) if (node === rec.el || node.contains(rec.el)) moveNode(this.parking, rec.el);
  }
  sync(parent, desired) {
    const keep = new Set(desired);
    // Move hosted subtrees while they are still connected. Removing an old pane
    // first would destroy iframe browsing contexts even if its DOM node survives.
    for (const child of [...parent.children]) if (!keep.has(child)) this.parkContentIn(child);
    syncChildren(parent, desired);
  }
  record(model, create) {
    this.usedRecords.add(model.Id);
    let rec = this.records.get(model.Id);
    if (rec && rec.model.constructor !== model.constructor) { this.parkContentIn(rec.el); rec.el.remove(); this.records.delete(model.Id); rec = null; }
    if (!rec) { rec = create(); rec.model = model; this.records.set(model.Id, rec); this.parking.append(rec.el); }
    rec.model = model; return rec;
  }
  renderNode(model) {
    if (model instanceof LayoutPane) return this.renderPane(model);
    if (model instanceof LayoutContent) return this.renderContent(model, true);
    return this.renderGroup(model);
  }
  renderGroup(model) {
    const rec = this.record(model, () => ({ el: element(this.doc, 'div', 'ad-group') }));
    rec.el.dataset.layoutId = model.Id;
    rec.el.style.flexDirection = model.Orientation === 'Vertical' ? 'column' : 'row';
    const children = [...model.Children].filter(x => x.IsVisible), nodes = [];
    children.forEach((child, index) => {
      const node = this.renderNode(child); this.applySizing(node, child, model.Orientation); nodes.push(node);
      if (index < children.length - 1) nodes.push(this.renderSplitter(model, child, children[index + 1]));
    });
    this.sync(rec.el, nodes); return rec.el;
  }
  applySizing(node, model, orientation) {
    const horizontal = orientation !== 'Vertical', length = horizontal ? model.DockWidth : model.DockHeight;
    if (length) node.style.flex = length.IsStar ? `${Math.max(.0001, length.Value)} 1 0px` : length.IsAbsolute ? `0 0 ${length.Value}px` : '0 1 auto';
    node.style.minWidth = `${model.DockMinWidth ?? 0}px`; node.style.minHeight = `${model.DockMinHeight ?? 0}px`;
    node.style.maxWidth = model.DockMaxWidth < 1000000 ? `${model.DockMaxWidth}px` : '';
    node.style.maxHeight = model.DockMaxHeight < 1000000 ? `${model.DockMaxHeight}px` : '';
  }
  renderPane(model) {
    const isDoc = model instanceof LayoutDocumentPane;
    const rec = this.record(model, () => {
      const el = element(this.doc, 'section', `ad-pane ${isDoc ? 'ad-document-pane' : 'ad-anchorable-pane'}`);
      el.dataset.paneId = model.Id;
      const title = element(this.doc, 'div', 'ad-pane-title');
      const caption = element(this.doc, 'div', 'ad-pane-caption');
      const actions = element(this.doc, 'div', 'ad-pane-actions');
      const menu = button(this.doc, 'down', 'Window actions', event => this.openContextMenu(rec.model.SelectedContent, event.clientX, event.clientY));
      const pin = button(this.doc, 'pin', 'Auto-hide group', () => this.manager.ToggleAutoHide(rec.model));
      const close = button(this.doc, 'close', 'Hide tool window', () => {
        const item = rec.model.SelectedContent; if (item instanceof LayoutAnchorable && item.CanHide) item.Hide(); else item?.Close();
      });
      actions.append(menu, pin, close); title.append(caption, actions);
      title.addEventListener('pointerdown', event => { if (!event.target.closest('button') && rec.model.ChildrenCount) this.beginDrag(event, rec.model); });
      title.addEventListener('dblclick', event => { if (!event.target.closest('button')) this.manager.Float(rec.model); });
      title.addEventListener('contextmenu', event => { event.preventDefault(); this.openContextMenu(rec.model.SelectedContent, event.clientX, event.clientY); });
      const tabRow = element(this.doc, 'div', 'ad-tab-row');
      const tabs = element(this.doc, 'div', 'ad-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', isDoc ? 'Documents' : 'Tool windows');
      const overflow = button(this.doc, 'down', 'All tabs', event => this.openTabList(rec.model, event)); overflow.classList.add('ad-tab-overflow');
      tabRow.append(tabs, overflow);
      const body = element(this.doc, 'div', 'ad-pane-body');
      const empty = element(this.doc, 'div', 'ad-empty-pane'); empty.append(icon(this.doc,'dock',30), element(this.doc,'p','','Drop a document here'));
      el.append(title, tabRow, body);
      const template = this.manager[isDoc ? 'DocumentPaneTemplate' : 'AnchorablePaneTemplate'];
      if (typeof template === 'function') template(model, el, this.manager);
      return { el, title, caption, actions, menu, pin, close, tabRow, tabs, overflow, body, empty };
    });
    const selected = model.SelectedContent;
    rec.el.classList.toggle('ad-active-pane', model.IsActive);
    rec.el.setAttribute('aria-label', selected?.Title || (isDoc ? 'Document pane' : 'Tool pane'));
    rec.title.hidden = isDoc || !model.ShowHeader;
    if (!isDoc) {
      this.renderLabel(rec.caption, selected, 'AnchorableTitleTemplate');
      rec.pin.hidden = !!model.FindParent(LayoutFloatingWindow); rec.pin.disabled = !model.CanAutoHide;
      rec.close.disabled = !selected || !(selected.CanHide || selected.CanClose);
    }
    const tabNodes = model.Children.map(child => this.renderTab(child, model)); this.sync(rec.tabs, tabNodes);
    rec.tabRow.hidden = !isDoc && model.ChildrenCount < 2;
    rec.overflow.hidden = model.ChildrenCount < 2;
    applyStyle(rec.el, this.manager[isDoc ? 'DocumentPaneControlStyle' : 'AnchorablePaneControlStyle'], model, this.manager);
    const panels = [];
    for (const child of model.Children) {
      // Once mounted, nonselected panels remain alive, so editors keep undo buffers, scroll and subscriptions.
      const already = this.contentRecords.has(child.ContentId);
      if (child === selected || already) panels.push(this.renderContent(child, child === selected));
    }
    if (!model.ChildrenCount) panels.push(rec.empty);
    this.sync(rec.body, panels);
    return rec.el;
  }
  renderTab(model, pane) {
    const key = `${pane.Id}:${model.ContentId}`; this.usedTabs.add(key);
    let rec = this.tabs.get(key);
    if (!rec) {
      const el = element(this.doc, 'div', 'ad-tab'); el.setAttribute('role','tab'); el.dataset.tabId = model.ContentId;
      const label = element(this.doc, 'span', 'ad-tab-label');
      const modified = element(this.doc,'span','ad-modified-dot','•'); modified.title = 'Modified';
      const close = button(this.doc,'close','Close tab',() => rec.model instanceof LayoutAnchorable && rec.model.CanHide ? rec.model.Hide() : rec.model.Close()); close.tabIndex = -1;
      el.append(label, modified, close);
      rec = { el, label, modified, close, model, pane };
      el.addEventListener('click', () => this.manager.Activate(rec.model));
      el.addEventListener('pointerdown', event => { if (!event.target.closest('button')) { this.manager.Activate(rec.model); this.beginDrag(event, rec.model); } });
      el.addEventListener('auxclick', event => { if (event.button === 1) { event.preventDefault(); rec.model.Close(); } });
      el.addEventListener('dblclick', event => { if (!event.target.closest('button')) rec.model.IsFloating ? rec.model.Dock() : rec.model.Float(); });
      el.addEventListener('contextmenu', event => { event.preventDefault(); this.openContextMenu(rec.model,event.clientX,event.clientY); });
      el.addEventListener('keydown', event => {
        if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key) && !event.altKey) {
          event.preventDefault(); const items = [...rec.pane.Children].filter(x => x.IsEnabled); let i = items.indexOf(rec.model);
          i = event.key === 'Home' ? 0 : event.key === 'End' ? items.length-1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
          if (items[i]) { this.manager.Activate(items[i]); this.requestRender(); this.win.requestAnimationFrame(() => this.tabs.get(`${rec.pane.Id}:${items[i].ContentId}`)?.el.focus()); }
        } else if (event.key === 'Delete' && event.shiftKey) { event.preventDefault(); rec.model.Close(); }
        else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.manager.Activate(rec.model); }
      });
      this.tabs.set(key,rec);
    }
    rec.model = model; rec.pane = pane;
    rec.el.id = `${this.manager.Id}-tab-${encodeURIComponent(model.Id)}`; rec.el.tabIndex = model.IsSelected ? 0 : -1;
    rec.el.setAttribute('aria-selected', String(model.IsSelected)); rec.el.setAttribute('aria-disabled', String(!model.IsEnabled));
    rec.el.setAttribute('aria-controls',`${this.manager.Id}-content-${encodeURIComponent(model.ContentId)}`);
    rec.el.classList.toggle('ad-selected', model.IsSelected); rec.el.classList.toggle('ad-pinned', model.IsPinned);
    rec.el.title = String(model.ToolTip || model.Title);
    this.renderLabel(rec.label,model, model instanceof LayoutAnchorable ? 'AnchorableHeaderTemplate' : 'DocumentHeaderTemplate');
    rec.modified.hidden = !model.IsModified; rec.close.hidden = model instanceof LayoutAnchorable ? !model.CanHide && !model.CanClose : !model.CanClose;
    return rec.el;
  }
  renderLabel(holder, model, property) {
    if (!model) { holder.replaceChildren(); return; }
    const template = selectTemplate(this.manager, property, model);
    const signature = [model, model.Title, model.IconSource, template];
    if (holder._signature?.every((x,i) => x === signature[i])) return;
    holder._signature = signature;
    if (typeof template === 'function') {
      const output = template(model, this.manager);
      holder.replaceChildren(output?.nodeType ? output : this.doc.createTextNode(String(output ?? ''))); return;
    }
    const glyph = element(this.doc,'span','ad-content-icon');
    const iconTemplate = selectTemplate(this.manager,'IconContentTemplate',model,model.IconSource);
    if (typeof iconTemplate === 'function') {
      const node = iconTemplate(model.IconSource, model, this.manager); glyph.append(node?.nodeType ? node : this.doc.createTextNode(String(node ?? '')));
    } else if (typeof model.IconSource === 'string' && /^(https?:|data:image\/(png|jpeg|gif|webp);|\.\.?\/|\/)/i.test(model.IconSource)) {
      const img = this.doc.createElement('img'); img.src = model.IconSource; img.alt = ''; img.width = 16; img.height = 16; glyph.append(img);
    } else if (model.IconSource) glyph.textContent = String(model.IconSource);
    else glyph.append(icon(this.doc,model instanceof LayoutDocument ? 'document' : 'tool'));
    holder.replaceChildren(glyph, element(this.doc,'span','ad-label-text',model.Title || 'Untitled'));
  }
  renderContent(model, visible) {
    let rec = this.contentRecords.get(model.ContentId);
    const template = selectTemplate(this.manager,'LayoutItemTemplate',model,model.Content);
    if (!rec) {
      const el = element(this.doc,'div','ad-content'); el.tabIndex = 0; el.setAttribute('role','tabpanel');
      rec = { el, ref: Symbol('new'), template: Symbol('new'), model, dispose: null }; this.contentRecords.set(model.ContentId,rec); this.parking.append(el);
    }
    rec.model = model;
    if (rec.ref !== model.Content || rec.template !== template) {
      rec.dispose?.(); rec.dispose = null;
      let result;
      try {
      if (typeof template === 'function') result = template(model.Content, model, this.manager);
      else if (typeof model.Content === 'function') result = model.Content(model, this.manager);
      else result = model.Content;
      if (result?.element?.nodeType || result?.Element?.nodeType) {
        rec.dispose = result.dispose || result.Dispose || null; result = result.element || result.Element;
      }
      if (result?.nodeType) {
        for (const other of this.contentRecords.values()) if (other !== rec && other.el.contains(result)) throw new Error('The same DOM content cannot be hosted in two layout items');
        rec.el.replaceChildren(result);
      } else {
        const body = element(this.doc,'div','ad-default-content');
        if (result == null) { body.append(icon(this.doc,model instanceof LayoutDocument ? 'document' : 'tool',32), element(this.doc,'h3','',model.Title), element(this.doc,'p','','Provide Content or a LayoutItemTemplate to populate this panel.')); }
        else { const pre = element(this.doc,'pre'); pre.textContent = typeof result === 'object' ? JSON.stringify(result,null,2) : String(result); body.append(pre); }
        rec.el.replaceChildren(body);
      }
      } catch (error) {
        const failure = element(this.doc, 'div', 'ad-default-content'); failure.setAttribute('role','alert');
        failure.append(element(this.doc,'h3','','Content could not be rendered'),element(this.doc,'p','',error.message || String(error)));
        rec.el.replaceChildren(failure); this.manager._emit('Error',{Error:error,Operation:'Render content',Model:model});
      }
      rec.ref = model.Content; rec.template = template;
    }
    rec.el.dataset.adContent = model.ContentId; rec.el.id = `${this.manager.Id}-content-${encodeURIComponent(model.ContentId)}`;
    rec.el.setAttribute('aria-label',model.Title); rec.el.hidden = !visible;
    if (visible) this.visibleContents.add(model.ContentId);
    return rec.el;
  }
  renderSides() {
    for (const side of SIDES) {
      const model = this.manager.Layout[`${side}Side`], rail = this.sideElements[side];
      const groups = [];
      for (const group of model.Children) {
        const record = this.record(group, () => {
          const el = element(this.doc,'div','ad-anchor-group');
          const template = this.manager.AnchorGroupTemplate; if (typeof template === 'function') template(group,el,this.manager);
          return { el, buttons: new Map() };
        });
        const buttons = [];
        for (const item of group.Children) {
          let btn = record.buttons.get(item.ContentId);
          if (!btn) {
            btn = element(this.doc,'button','ad-anchor-tab'); btn.type = 'button'; btn.dataset.contentId = item.ContentId;
            btn.addEventListener('pointerdown', event => this.beginDrag(event, this.manager.Find(btn.dataset.contentId)));
            btn.addEventListener('click', () => { const content = this.manager.Find(btn.dataset.contentId); if (this.manager._autoHideModel === content) this.manager.HideAutoHideWindow(); else this.manager.Activate(content); });
            btn.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { clearTimeout(this.hoverTimer); this.hoverTimer = this.win.setTimeout(() => this.manager.ShowAutoHideWindow(this.manager.Find(btn.dataset.contentId)),this.manager.AutoHideDelay); } });
            btn.addEventListener('pointerleave', () => { clearTimeout(this.hoverTimer); this.schedulePeekClose(); });
            btn.addEventListener('contextmenu', event => { event.preventDefault(); this.openContextMenu(this.manager.Find(btn.dataset.contentId),event.clientX,event.clientY); });
            const template = this.manager.AnchorTemplate; if (typeof template === 'function') template(item,btn,this.manager);
            record.buttons.set(item.ContentId,btn);
          }
          btn.disabled = !item.IsEnabled; btn.title = item.Title; btn.setAttribute('aria-expanded',String(this.manager._autoHideModel === item));
          this.renderLabel(btn,item,'AnchorableHeaderTemplate'); buttons.push(btn);
        }
        this.sync(record.el,buttons); groups.push(record.el);
      }
      this.sync(rail,groups); rail.hidden = !groups.length;
      if (rail._template !== this.manager.AnchorSideTemplate) {
        rail._template = this.manager.AnchorSideTemplate;
        if (typeof rail._template === 'function') rail._template(model,rail,this.manager);
      }
    }
  }
  renderPeek() {
    const model = this.manager._autoHideModel;
    if (!model || !model.IsAutoHidden) { this.parkContentIn(this.peek); this.peek?.remove(); this.peek = null; return; }
    if (!this.peek) {
      this.peek = element(this.doc,'section','ad-peek'); this.peek.setAttribute('role','dialog');
      const title = element(this.doc,'div','ad-pane-title'); this.peekCaption = element(this.doc,'div','ad-pane-caption');
      title.append(this.peekCaption, button(this.doc,'pin','Pin tool window',()=>this.manager.ToggleAutoHide(this.manager._autoHideModel)),button(this.doc,'close','Hide tool window',()=>this.manager.Hide(this.manager._autoHideModel)));
      this.peekBody = element(this.doc,'div','ad-pane-body'); this.peekHandle = element(this.doc,'div','ad-peek-resizer');
      this.peekHandle.tabIndex = 0; this.peekHandle.setAttribute('role','separator'); this.peekHandle.setAttribute('aria-label','Resize auto-hidden window');
      this.peekHandle.addEventListener('pointerdown',event=>this.beginPeekResize(event));
      this.peekHandle.addEventListener('keydown',event=>{
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return; event.preventDefault();
        const item=this.manager._autoHideModel, side=item.Parent.Parent.Side, key=['Left','Right'].includes(side)?'AutoHideWidth':'AutoHideHeight';
        const delta=['ArrowRight','ArrowDown'].includes(event.key)?10:-10;
        this.manager.Transaction('Resize auto-hide',()=>{item[key]=Math.max(100,item[key]+delta);});
      });
      this.peek.append(title,this.peekBody,this.peekHandle); this.host.append(this.peek);
      this.peek.addEventListener('pointerenter',()=>clearTimeout(this.peekCloseTimer));
      this.peek.addEventListener('pointerleave',()=>this.schedulePeekClose());
    }
    const side = model.Parent.Parent.Side, bounds = this.workspace.getBoundingClientRect(), origin = this.host.getBoundingClientRect();
    const rect = rectRelative(bounds,origin), horizontal = ['Left','Right'].includes(side);
    const width = horizontal ? clamp(model.AutoHideWidth, model.AutoHideMinWidth, rect.width) : rect.width;
    const height = horizontal ? rect.height : clamp(model.AutoHideHeight, model.AutoHideMinHeight, rect.height);
    this.peek.dataset.side = side.toLowerCase(); this.peek.setAttribute('aria-label',model.Title);
    Object.assign(this.peek.style,{ left:`${rect.x + (side==='Right'?rect.width-width:0)}px`,top:`${rect.y+(side==='Bottom'?rect.height-height:0)}px`,width:`${width}px`,height:`${height}px` });
    this.renderLabel(this.peekCaption,model,'AnchorableTitleTemplate');
    this.sync(this.peekBody,[this.renderContent(model,true)]);
  }
  schedulePeekClose() {
    clearTimeout(this.peekCloseTimer);
    this.peekCloseTimer = this.win.setTimeout(()=>{
      if (!this.peek?.matches(':hover') && !this.peek?.contains(this.doc.activeElement)) this.manager.HideAutoHideWindow();
    },this.manager.AutoHideCloseDelay);
  }
  renderFloating(model) {
    const rec = this.record(model,()=>{
      const el=element(this.doc,'section','ad-floating'); el.setAttribute('role','dialog'); el.setAttribute('aria-modal','false');
      const title=element(this.doc,'div','ad-float-title'); const caption=element(this.doc,'div','ad-float-caption');
      const dock=button(this.doc,'dock','Dock window',()=>this.manager.Dock(rec.model));
      const maximize=button(this.doc,'maximize','Maximize window',()=>this.manager.Transaction('Maximize window',()=>{rec.model.IsMaximized=!rec.model.IsMaximized;}));
      const close=button(this.doc,'close','Close floating window',()=>this.manager.CloseFloatingWindow(rec.model),'ad-close-window');
      title.append(caption,dock,maximize,close);
      title.addEventListener('pointerdown',event=>{if(!event.target.closest('button'))this.beginDrag(event,rec.model);});
      title.addEventListener('dblclick',event=>{if(!event.target.closest('button'))this.manager.Transaction('Maximize window',()=>{rec.model.IsMaximized=!rec.model.IsMaximized;});});
      title.addEventListener('contextmenu',event=>{if(this.manager.ShowSystemMenu){event.preventDefault();this.openContextMenu(contents(rec.model)[0],event.clientX,event.clientY);}});
      const body=element(this.doc,'div','ad-float-body'); el.append(title,body);
      for(const edge of ['n','s','e','w','ne','nw','se','sw']){
        const grip=element(this.doc,'div',`ad-resize-handle ad-resize-${edge}`);grip.dataset.edge=edge;grip.tabIndex=edge==='se'?0:-1;
        grip.setAttribute('role','separator');grip.setAttribute('aria-label',`Resize floating window ${edge}`);
        grip.addEventListener('pointerdown',event=>this.beginFloatingResize(event,rec.model,edge));
        grip.addEventListener('keydown',event=>{
          if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();
          this.manager.Transaction('Resize floating window',()=>{
            if(['ArrowLeft','ArrowRight'].includes(event.key))rec.model.FloatingWidth=Math.max(this.manager.FloatingWindowMinWidth,rec.model.FloatingWidth+(event.key==='ArrowRight'?10:-10));
            else rec.model.FloatingHeight=Math.max(this.manager.FloatingWindowMinHeight,rec.model.FloatingHeight+(event.key==='ArrowDown'?10:-10));
          });
        });el.append(grip);
      }
      el.addEventListener('pointerdown',()=>{const item=contents(rec.model).find(x=>x.IsSelected)||contents(rec.model)[0];if(item)this.manager.Activate(item);});
      return {el,title,caption,dock,maximize,close,body};
    });
    const all=contents(model),selected=all.find(x=>x.IsActive)||all.find(x=>x.IsSelected)||all[0];
    this.renderLabel(rec.caption,selected,selected instanceof LayoutAnchorable?'AnchorableTitleTemplate':'DocumentTitleTemplate');
    rec.el.setAttribute('aria-label',selected?.Title||'Floating window');rec.el.dataset.floatingId=model.Id;
    rec.el.classList.toggle('ad-maximized',model.IsMaximized);rec.el.classList.toggle('ad-active-floating',all.some(x=>x.IsActive));
    const bounds=this.floatingBounds(model);Object.assign(rec.el.style,{left:`${bounds.x}px`,top:`${bounds.y}px`,width:`${bounds.width}px`,height:`${bounds.height}px`,zIndex:String(model.ZIndex)});
    rec.maximize.replaceChildren(icon(this.doc,model.IsMaximized?'restore':'maximize'));rec.maximize.title=model.IsMaximized?'Restore window':'Maximize window';rec.maximize.setAttribute('aria-label',rec.maximize.title);
    rec.dock.disabled=!all.every(x=>x.CanDock&&x.CanMove);
    if(model.RootPanel)this.sync(rec.body,[this.renderNode(model.RootPanel)]);else this.sync(rec.body,[]);
    return rec.el;
  }
  floatingBounds(model) {
    const width=this.host.clientWidth,height=this.host.clientHeight;
    if(model.IsMaximized)return{x:0,y:0,width,height};
    const w=Math.min(width,Math.max(this.manager.FloatingWindowMinWidth,model.FloatingWidth)),h=Math.min(height,Math.max(this.manager.FloatingWindowMinHeight,model.FloatingHeight));
    return{x:clamp(model.FloatingLeft,0,width-w),y:clamp(model.FloatingTop,0,height-h),width:w,height:h};
  }
  renderSplitter(parent,a,b) {
    const id=`${parent.Id}:${a.Id}:${b.Id}`;this.usedSplitters.add(id);let rec=this.splitters.get(id);
    if(!rec){
      const el=element(this.doc,'div','ad-splitter');el.tabIndex=0;el.setAttribute('role','separator');
      rec={el,parent,a,b};el.addEventListener('pointerdown',event=>this.beginSplitterResize(event,rec));
      el.addEventListener('keydown',event=>{
        if (!this.canResizeSplit(rec)) return;
        const horizontal=rec.parent.Orientation!=='Vertical';
        const delta=event.key===(horizontal?'ArrowRight':'ArrowDown')?1:event.key===(horizontal?'ArrowLeft':'ArrowUp')?-1:0;
        if(!delta&&event.key!=='Home'&&event.key!=='End')return;event.preventDefault();
        const metrics=this.splitterMetrics(rec);let value=metrics.aSize+delta*(event.shiftKey?50:event.altKey?1:10);
        if(event.key==='Home')value=metrics.total/2;if(event.key==='End')value=metrics.max;
        this.commitSplitter(rec,metrics,clamp(value,metrics.min,metrics.max));
      });
      el.addEventListener('dblclick',()=>{if(!this.canResizeSplit(rec))return;const metrics=this.splitterMetrics(rec);this.commitSplitter(rec,metrics,clamp(metrics.total/2,metrics.min,metrics.max));});
      this.splitters.set(id,rec);
    }
    Object.assign(rec,{parent,a,b});const horizontal=parent.Orientation!=='Vertical';
    rec.el.setAttribute('aria-disabled',String(!this.canResizeSplit(rec)));rec.el.tabIndex=this.canResizeSplit(rec)?0:-1;
    rec.el.classList.toggle('ad-splitter-vertical',horizontal);rec.el.classList.toggle('ad-splitter-horizontal',!horizontal);
    rec.el.setAttribute('aria-orientation',horizontal?'vertical':'horizontal');rec.el.setAttribute('aria-label',horizontal?'Resize columns':'Resize rows');
    rec.el.setAttribute('aria-valuemin','0');rec.el.setAttribute('aria-valuemax','100');
    const av=a[horizontal?'DockWidth':'DockHeight'].Value,bv=b[horizontal?'DockWidth':'DockHeight'].Value;
    rec.el.setAttribute('aria-valuenow',String(Math.round(100*av/(av+bv||1))));
    return rec.el;
  }
  elementFor(model) { return this.records.get(model.Id)?.el || (model instanceof LayoutContent ? this.contentRecords.get(model.ContentId)?.el : null); }
  contentElement(model) { return this.contentRecords.get(model.ContentId)?.el || null; }
  controlFor(model) { return controlFor(model,this.manager); }
  focusContent(model) {
    if(!model)return;this.requestRender();this.win.requestAnimationFrame(()=>{
      const content=this.contentElement(model);const target=content?.querySelector('textarea,input,button,[contenteditable="true"],[tabindex="0"]')||content;
      target?.focus({preventScroll:true});
    });
  }
  announce(text){this.live.textContent=text;}
  strings(key){return this.manager.Strings?.[key]||key;}
  openContextMenu(model,x,y) {
    if(!model)return;const wrapper=this.manager.GetLayoutItemFromModel(model);
    const cmd=(Label,command,Shortcut='')=>({Label,Command:command,Shortcut});
    const defaults=[
      cmd('Float',wrapper.FloatCommand),cmd('Dock',wrapper.DockCommand),
      ...(model instanceof LayoutAnchorable?[cmd('Dock as document',wrapper.DockAsDocumentCommand),cmd(model.IsAutoHidden?'Pin tool window':'Auto-hide group',wrapper.AutoHideCommand),cmd('Hide',wrapper.HideCommand)]:[]),
      null,
      cmd('New vertical tab group',wrapper.NewVerticalTabGroupCommand),cmd('New horizontal tab group',wrapper.NewHorizontalTabGroupCommand),
      cmd('Move to next tab group',wrapper.MoveToNextTabGroupCommand),cmd('Move to previous tab group',wrapper.MoveToPreviousTabGroupCommand),
      ...(model instanceof LayoutAnchorable?[null,...SIDES.map(side=>({Label:`Dock to ${side.toLowerCase()} edge`,Execute:()=>this.manager.Dock(model,this.manager.Layout,side),CanExecute:()=>this.manager.CanDockAt(model,this.manager.Layout,side)}))]:[]),
      null,{Label:'Open in browser window',Execute:()=>this.popOut(model),CanExecute:()=>model.CanFloat&&model.CanMove},
      null,cmd('Close',wrapper.CloseCommand,'Ctrl+F4'),cmd('Close other tabs',wrapper.CloseAllButThisCommand),cmd('Close all tabs',wrapper.CloseAllCommand)
    ];
    const provider=model instanceof LayoutAnchorable?this.manager.AnchorableContextMenu:this.manager.DocumentContextMenu;
    const entries=typeof provider==='function'?provider(model,this.manager,defaults):Array.isArray(provider)?provider:defaults;
    this.showMenu(entries,x,y,model.Title);
  }
  openTabList(pane,event) {
    this.showMenu(pane.Children.map(model=>({
      Label:model.Title,Checked:model.IsSelected,Execute:()=>{this.manager.Activate(model);this.focusContent(model);},CanExecute:()=>model.IsEnabled,
      HeaderTemplate:selectTemplate(this.manager,'DocumentPaneMenuItemHeaderTemplate',model),Model:model
    })),event.clientX,event.clientY,'Open tabs');
  }
  showMenu(entries,x,y,title='Window actions') {
    this.closeMenu();if(!Array.isArray(entries))throw new TypeError('Context menus must return an array of menu entries');
    this.menuFocus=this.doc.activeElement;
    const menu=element(this.doc,'div','ad-context-menu');menu.setAttribute('role','menu');menu.setAttribute('aria-label',title);
    menu.append(element(this.doc,'div','ad-menu-title',title));
    for(const entry of entries){
      if(!entry){menu.append(element(this.doc,'div','ad-menu-separator'));continue;}
      const row=element(this.doc,'button','ad-menu-item');row.type='button';row.setAttribute('role',entry.Checked!=null?'menuitemradio':'menuitem');
      if(entry.Checked!=null)row.setAttribute('aria-checked',String(entry.Checked));
      const enabled=entry.Command?.CanExecute?.()??(typeof entry.CanExecute==='function'?entry.CanExecute():entry.CanExecute!==false);row.disabled=!enabled;
      const check=element(this.doc,'span','ad-menu-check');if(entry.Checked)check.append(icon(this.doc,'check'));
      const label=element(this.doc,'span','ad-menu-label',this.strings(entry.Label||entry.label||''));
      if(typeof entry.HeaderTemplate==='function'){
        const node=entry.HeaderTemplate(entry.Model,this.manager);label.replaceChildren(node?.nodeType?node:this.doc.createTextNode(String(node??'')));
      }
      row.append(check,label,element(this.doc,'kbd','',entry.Shortcut||''));
      row.addEventListener('click',()=>{this.closeMenu();if(entry.Command)entry.Command.Execute();else(entry.Execute||entry.action)?.();});menu.append(row);
    }
    this.host.append(menu);this.menu=menu;
    const origin=this.host.getBoundingClientRect(),rect=menu.getBoundingClientRect();
    if(!Number.isFinite(x)||!Number.isFinite(y)||x===0&&y===0){const active=this.elementFor(this.manager.ActiveModel?.Parent||this.manager.Layout.RootPanel)?.getBoundingClientRect();x=active?.left||origin.left+20;y=active?.top||origin.top+20;}
    menu.style.left=`${clamp(x-origin.left,4,origin.width-rect.width-4)}px`;menu.style.top=`${clamp(y-origin.top,4,origin.height-rect.height-4)}px`;
    menu.querySelector('button:not(:disabled)')?.focus();
  }
  closeMenu() {if(!this.menu)return;this.menu.remove();this.menu=null;if(this.menuFocus?.isConnected)this.menuFocus.focus({preventScroll:true});}
  beginDrag(event,subject) {
    if(event.button!==0||event.isPrimary===false||this.interaction)return;
    const items=this.manager._subjectItems(subject);
    if(!items.length||!items.every(x=>x.CanMove&&x.IsEnabled))return;
    if(subject instanceof LayoutContent&&subject.Parent instanceof LayoutPane&&!subject.Parent.CanRepositionItems)return;
    if(subject instanceof LayoutFloatingWindow&&subject.IsMaximized)return;
    const start={x:event.clientX,y:event.clientY};let active=false,drop=null;
    const floating=subject instanceof LayoutFloatingWindow?subject:null;
    const floatingElement=floating?this.elementFor(floating):null;
    const original=floating?this.floatingBounds(floating):null;
    const payload={subject,items};this.closeMenu();
    const activate=()=>{
      active=true;this.host.classList.add('ad-dragging');this.dragPayload=payload;
      if(floatingElement)floatingElement.style.pointerEvents='none';
      else{this.ghost=element(this.doc,'div','ad-drag-ghost');this.ghost.append(icon(this.doc,items[0] instanceof LayoutDocument?'document':'tool'),element(this.doc,'span','',items.length===1?items[0].Title:`${items.length} tool windows`));this.host.append(this.ghost);}
      this.announce(`Dragging ${items[0].Title}. Drop on a guide to dock. Escape cancels.`);
    };
    const clean=()=>{
      this.ghost?.remove();this.ghost=null;this.overlay.replaceChildren();this.host.classList.remove('ad-dragging');this.dragPayload=null;
      if(floatingElement){floatingElement.style.transform='';floatingElement.style.pointerEvents='';}this.requestRender();
    };
    this.trackPointer(event,{
      type:'drag',
      move:e=>{
        const dx=e.clientX-start.x,dy=e.clientY-start.y;
        if(!active&&Math.hypot(dx,dy)<5)return;if(!active)activate();
        if(this.ghost)Object.assign(this.ghost.style,{left:`${e.clientX+14}px`,top:`${e.clientY+14}px`});
        if(floatingElement)floatingElement.style.transform=`translate(${dx}px,${dy}px)`;
        drop=e.ctrlKey?null:this.findDrop(payload,e.clientX,e.clientY);this.drawDropGuides(payload,drop,e.clientX,e.clientY,e.ctrlKey);
      },
      end:e=>{
        if(!active){clean();return;}
        clean();
        if(drop&&this.manager.CanDockAt(subject,drop.target,drop.position)){
          this.manager.Dock(subject,drop.target,drop.position,drop.index);this.announce(`Docked ${items[0].Title} ${drop.position.toLowerCase()}.`);
        }else if(floating){
          this.manager.Transaction('Move floating window',()=>{floating.FloatingLeft=clamp(original.x+e.clientX-start.x,0,this.host.clientWidth-original.width);floating.FloatingTop=clamp(original.y+e.clientY-start.y,0,this.host.clientHeight-original.height);});
        }else if(items.every(x=>x.CanFloat)){
          const origin=this.host.getBoundingClientRect();this.manager.Float(subject,{FloatingLeft:Math.max(0,e.clientX-origin.left-120),FloatingTop:Math.max(0,e.clientY-origin.top-18)});this.announce(`Floated ${items[0].Title}.`);
        }else this.announce('No valid docking target. Layout unchanged.');
      },cancel:clean
    });
  }
  findDrop(payload,x,y) {
    const hostRect=this.host.getBoundingClientRect();
    if(x<hostRect.left||x>hostRect.right||y<hostRect.top||y>hostRect.bottom)return null;
    const edge=32;let side=null;
    if(x-hostRect.left<edge)side='Left';else if(hostRect.right-x<edge)side='Right';else if(y-hostRect.top<edge)side='Top';else if(hostRect.bottom-y<edge)side='Bottom';
    if(side&&this.manager.CanDockAt(payload.subject,this.manager.Layout,side))return{target:this.manager.Layout,position:side,rect:rectRelative(this.workspace.getBoundingClientRect(),hostRect),outer:true};
    const root=this.host.getRootNode();
    const hits=root.elementsFromPoint?root.elementsFromPoint(x,y):this.doc.elementsFromPoint(x,y);
    let pane=null,paneElement=null;
    for(const hit of hits){
      const candidate=hit.closest?.('.ad-pane');if(!candidate||!this.host.contains(candidate)||candidate.closest('.ad-manager')!==this.host)continue;
      const model=this.manager.FindById(candidate.dataset.paneId);
      if(!model||model===payload.subject||payload.subject instanceof LayoutFloatingWindow&&model.FindParent(LayoutFloatingWindow)===payload.subject)continue;
      pane=model;paneElement=candidate;break;
    }
    if(!pane)return null;
    const rect=paneElement.getBoundingClientRect(),relative=rectRelative(rect,hostRect);
    const tabs=this.records.get(pane.Id)?.tabs,tabRect=tabs?.getBoundingClientRect();
    if(tabRect&&y>=tabRect.top&&y<=tabRect.bottom){
      let index=pane.ChildrenCount;
      for(let i=0;i<pane.ChildrenCount;i++){
        const tab=this.tabs.get(`${pane.Id}:${pane.Children[i].ContentId}`)?.el.getBoundingClientRect();
        if(tab&&x<tab.left+tab.width/2){index=i;break;}
      }
      return this.manager.CanDockAt(payload.subject,pane,'Center')?{target:pane,position:'Center',index,rect:relative,tab:true}:null;
    }
    const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
    const positions=[['Top',0,-40],['Left',-40,0],['Center',0,0],['Right',40,0],['Bottom',0,40]];
    let position=positions.find(([,dx,dy])=>Math.abs(x-cx-dx)<19&&Math.abs(y-cy-dy)<19)?.[0];
    if(!position){
      const nx=(x-rect.left)/rect.width,ny=(y-rect.top)/rect.height;
      const edges=[['Left',nx],['Right',1-nx],['Top',ny],['Bottom',1-ny]].sort((a,b)=>a[1]-b[1]);position=edges[0][1]<.23?edges[0][0]:'Center';
    }
    if(!this.manager.CanDockAt(payload.subject,pane,position))return{target:pane,position:null,rect:relative,invalid:true};
    return{target:pane,position,rect:relative};
  }
  drawDropGuides(payload,drop,x,y,suspended=false) {
    this.overlay.replaceChildren();if(suspended)return;
    const origin=this.host.getBoundingClientRect();
    if(drop?.rect){
      const {rect}=drop;
      if(drop.position){
        const preview=element(this.doc,'div','ad-drop-preview');let{x:px,y:py,width,height}=rect;
        if(drop.position==='Left')width=drop.outer?Math.min(260,width*.35):width/2;
        if(drop.position==='Right'){const w=drop.outer?Math.min(260,width*.35):width/2;px+=width-w;width=w;}
        if(drop.position==='Top')height=drop.outer?Math.min(210,height*.35):height/2;
        if(drop.position==='Bottom'){const h=drop.outer?Math.min(210,height*.35):height/2;py+=height-h;height=h;}
        Object.assign(preview.style,{left:`${px}px`,top:`${py}px`,width:`${width}px`,height:`${height}px`});this.overlay.append(preview);
      }
      if(!drop.outer){
        const cx=rect.x+rect.width/2,cy=rect.y+rect.height/2;
        for(const [side,dx,dy]of[['Top',0,-40],['Left',-40,0],['Center',0,0],['Right',40,0],['Bottom',0,40]]){
          if(!this.manager.CanDockAt(payload.subject,drop.target,side))continue;
          const guide=element(this.doc,'div',`ad-drop-guide ${drop.position===side?'ad-drop-guide-active':''}`);guide.dataset.dockPosition=side;
          guide.append(icon(this.doc,side.toLowerCase(),22));Object.assign(guide.style,{left:`${cx+dx-18}px`,top:`${cy+dy-18}px`});this.overlay.append(guide);
        }
      }
    }
    for(const side of SIDES){
      if(!this.manager.CanDockAt(payload.subject,this.manager.Layout,side))continue;
      const guide=element(this.doc,'div',`ad-drop-guide ad-root-guide ${drop?.outer&&drop.position===side?'ad-drop-guide-active':''}`);guide.dataset.rootDock=side;guide.append(icon(this.doc,side.toLowerCase(),20));
      const left=side==='Left'?7:side==='Right'?origin.width-43:origin.width/2-18;
      const top=side==='Top'?7:side==='Bottom'?origin.height-43:origin.height/2-18;
      Object.assign(guide.style,{left:`${left}px`,top:`${top}px`});this.overlay.append(guide);
    }
    if(drop?.tab){
      const pane=drop.target,index=drop.index,reference=this.tabs.get(`${pane.Id}:${pane.Children[Math.min(index,pane.ChildrenCount-1)]?.ContentId}`)?.el.getBoundingClientRect();
      if(reference){const marker=element(this.doc,'div','ad-tab-drop-marker');Object.assign(marker.style,{left:`${(index===pane.ChildrenCount?reference.right:reference.left)-origin.left}px`,top:`${reference.top-origin.top}px`,height:`${reference.height}px`});this.overlay.append(marker);}
    }
  }
  trackPointer(event,callbacks) {
    event.preventDefault();
    const capture=event.currentTarget||event.target;
    try{capture.setPointerCapture?.(event.pointerId);}catch{}
    const controller=new this.win.AbortController(),opts={signal:controller.signal,capture:true};let latest=null,frame=0,finished=false;
    const cleanup=()=>{if(frame)this.win.cancelAnimationFrame(frame);controller.abort();try{capture.releasePointerCapture?.(event.pointerId);}catch{}this.interaction=null;this.doc.documentElement.classList.remove('ad-is-interacting');};
    const cancel=()=>{if(finished)return;finished=true;cleanup();callbacks.cancel?.();};
    this.interaction={type:callbacks.type,cancel};this.doc.documentElement.classList.add('ad-is-interacting');
    this.doc.addEventListener('pointermove',e=>{
      if(e.pointerId!==event.pointerId)return;e.preventDefault();latest=e;
      if(!frame)frame=this.win.requestAnimationFrame(()=>{frame=0;const point=latest;latest=null;if(point&&!finished)callbacks.move?.(point);});
    },opts);
    this.doc.addEventListener('pointerup',e=>{
      if(e.pointerId!==event.pointerId||finished)return;
      if(frame){this.win.cancelAnimationFrame(frame);frame=0;}callbacks.move?.(e);finished=true;cleanup();callbacks.end?.(e);
    },opts);
    this.doc.addEventListener('pointercancel',e=>{if(e.pointerId===event.pointerId)cancel();},opts);
    this.doc.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();cancel();}},opts);
  }
  cancelInteraction(){this.interaction?.cancel();}
  minSize(model,axis) {
    const key=axis==='x'?'DockMinWidth':'DockMinHeight',own=model[key]||0;
    if(model instanceof LayoutPane||model instanceof LayoutContent)return own;
    const kids=[...model.Children].filter(x=>x.IsVisible);if(!kids.length)return own;
    const parallel=(axis==='x')===(model.Orientation!=='Vertical');
    return Math.max(own,parallel?kids.reduce((sum,child)=>sum+this.minSize(child,axis),0)+(kids.length-1)*(axis==='x'?this.manager.GridSplitterWidth:this.manager.GridSplitterHeight):Math.max(...kids.map(child=>this.minSize(child,axis))));
  }
  splitterMetrics(rec) {
    const horizontal=rec.parent.Orientation!=='Vertical',axis=horizontal?'x':'y',dimension=horizontal?'width':'height';
    const aRect=this.elementFor(rec.a).getBoundingClientRect(),bRect=this.elementFor(rec.b).getBoundingClientRect();
    const aSize=aRect[dimension],total=aSize+bRect[dimension],aMin=this.minSize(rec.a,axis),bMin=this.minSize(rec.b,axis);
    let min=Math.max(aMin,total-(rec.b[horizontal?'DockMaxWidth':'DockMaxHeight']||1000000));
    let max=Math.min(total-bMin,rec.a[horizontal?'DockMaxWidth':'DockMaxHeight']||1000000);
    if(min>max){min=Math.min(aSize,total);max=min;}
    const siblings=[...rec.parent.Children].filter(x=>x.IsVisible).map(model=>({model,size:this.elementFor(model).getBoundingClientRect()[dimension]}));
    return{horizontal,axis,aSize,total,min,max,siblings};
  }
  canResizeSplit(rec) {
    const horizontal = rec.parent.Orientation !== 'Vertical', key = horizontal ? 'DockWidth' : 'DockHeight', flag = horizontal ? 'ResizableAbsoluteDockWidth' : 'ResizableAbsoluteDockHeight';
    return [rec.a, rec.b].every(model => !model[key].IsAbsolute || model[flag] !== false);
  }
  beginSplitterResize(event,rec) {
    if(event.button!==0||this.interaction||!this.canResizeSplit(rec))return;
    const metrics=this.splitterMetrics(rec),start=metrics.horizontal?event.clientX:event.clientY;let value=metrics.aSize;
    this.host.classList.add('ad-resizing');
    this.trackPointer(event,{type:'splitter',move:e=>{
      value=clamp(metrics.aSize+(metrics.horizontal?e.clientX:e.clientY)-start,metrics.min,metrics.max);
      for(const{model,size}of metrics.siblings)this.elementFor(model).style.flex=`0 0 ${model===rec.a?value:model===rec.b?metrics.total-value:size}px`;
      rec.el.setAttribute('aria-valuenow',String(Math.round(100*value/metrics.total)));
    },end:()=>{this.host.classList.remove('ad-resizing');this.commitSplitter(rec,metrics,value);},cancel:()=>{this.host.classList.remove('ad-resizing');this.requestRender();}});
  }
  commitSplitter(rec,metrics,value) {
    const key=metrics.horizontal?'DockWidth':'DockHeight';
    this.manager.Transaction('Resize split',()=>{for(const{model,size}of metrics.siblings)model[key]=`${Math.max(.01,model===rec.a?value:model===rec.b?metrics.total-value:size)}*`;});
    this.announce('Pane sizes updated.');
  }
  beginFloatingResize(event,model,edge) {
    if(event.button!==0||this.interaction||model.IsMaximized)return;event.stopPropagation();
    const start={x:event.clientX,y:event.clientY},original=this.floatingBounds(model);let bounds={...original};const el=this.elementFor(model);
    this.trackPointer(event,{type:'floating-resize',move:e=>{
      const dx=e.clientX-start.x,dy=e.clientY-start.y;let{x,y,width,height}=original;
      if(edge.includes('e'))width=clamp(original.width+dx,this.manager.FloatingWindowMinWidth,this.host.clientWidth-x);
      if(edge.includes('s'))height=clamp(original.height+dy,this.manager.FloatingWindowMinHeight,this.host.clientHeight-y);
      if(edge.includes('w')){x=clamp(original.x+dx,0,original.x+original.width-this.manager.FloatingWindowMinWidth);width=original.x+original.width-x;}
      if(edge.includes('n')){y=clamp(original.y+dy,0,original.y+original.height-this.manager.FloatingWindowMinHeight);height=original.y+original.height-y;}
      bounds={x,y,width,height};Object.assign(el.style,{left:`${x}px`,top:`${y}px`,width:`${width}px`,height:`${height}px`});
    },end:()=>this.manager.Transaction('Resize floating window',()=>{model.FloatingLeft=bounds.x;model.FloatingTop=bounds.y;model.FloatingWidth=bounds.width;model.FloatingHeight=bounds.height;for(const item of contents(model)){item.FloatingLeft=bounds.x;item.FloatingTop=bounds.y;item.FloatingWidth=bounds.width;item.FloatingHeight=bounds.height;}}),cancel:()=>this.requestRender()});
  }
  beginPeekResize(event) {
    if(event.button!==0||this.interaction)return;const model=this.manager._autoHideModel;if(!model)return;
    const side=model.Parent.Parent.Side,horizontal=['Left','Right'].includes(side),key=horizontal?'AutoHideWidth':'AutoHideHeight';
    const start=horizontal?event.clientX:event.clientY,original=model[key],sign=['Right','Bottom'].includes(side)?-1:1;
    const max=horizontal?this.workspace.clientWidth:this.workspace.clientHeight,min=horizontal?model.AutoHideMinWidth:model.AutoHideMinHeight;let value=original;
    this.trackPointer(event,{type:'auto-hide-resize',move:e=>{value=clamp(original+sign*((horizontal?e.clientX:e.clientY)-start),min,max);if(horizontal){this.peek.style.width=`${value}px`;if(side==='Right'){const r=rectRelative(this.workspace.getBoundingClientRect(),this.host.getBoundingClientRect());this.peek.style.left=`${r.x+r.width-value}px`;}}else{this.peek.style.height=`${value}px`;if(side==='Bottom'){const r=rectRelative(this.workspace.getBoundingClientRect(),this.host.getBoundingClientRect());this.peek.style.top=`${r.y+r.height-value}px`;}}},end:()=>this.manager.Transaction('Resize auto-hide',()=>{model[key]=value;}),cancel:()=>this.requestRender()});
  }
  onKeyDown(event) {
    if(!this.manager.AllowKeyboardNavigation)return;
    if(event.key==='Escape'){
      if(this.interaction){event.preventDefault();this.cancelInteraction();return;}
      if(this.menu){event.preventDefault();this.closeMenu();return;}
      if(this.navigator){event.preventDefault();this.closeNavigator(false);return;}
      if(this.peek){event.preventDefault();this.manager.HideAutoHideWindow();this.host.focus();return;}
    }
    if(this.menu){
      const rows=[...this.menu.querySelectorAll('button:not(:disabled)')];let index=rows.indexOf(this.doc.activeElement);
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();index=event.key==='Home'?0:event.key==='End'?rows.length-1:(index+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length;rows[index]?.focus();}
      return;
    }
    if(this.navigator){
      if(['Tab','ArrowDown','ArrowUp','ArrowRight','ArrowLeft'].includes(event.key)){event.preventDefault();this.stepNavigator(event.shiftKey||['ArrowUp','ArrowLeft'].includes(event.key)?-1:1);}
      if(event.key==='Enter'){event.preventDefault();this.closeNavigator(true);}return;
    }
    const editable=event.target.closest?.('input,textarea,[contenteditable="true"]');
    if((event.ctrlKey&&event.key==='Tab')||(event.altKey&&event.key==='`')){event.preventDefault();this.showNavigator();this.stepNavigator(event.shiftKey?-1:1);return;}
    if(event.key==='F6'){event.preventDefault();this.manager.FocusNextPane(event.shiftKey);return;}
    if(event.ctrlKey&&event.key==='F4'){event.preventDefault();this.manager.ActiveModel?.Close();return;}
    if(event.shiftKey&&event.key==='F10'){event.preventDefault();const rect=this.elementFor(this.manager.ActiveModel?.Parent||this.manager.Layout.RootPanel)?.getBoundingClientRect();this.openContextMenu(this.manager.ActiveModel,rect?.left+20,rect?.top+30);return;}
    if(event.altKey&&event.shiftKey&&['ArrowLeft','ArrowRight'].includes(event.key)){
      const item=this.manager.ActiveModel,pane=item?.Parent;if(pane instanceof LayoutPane&&pane.CanRepositionItems&&item.CanMove){const old=pane.IndexOf(item),next=clamp(old+(event.key==='ArrowRight'?1:-1),0,pane.ChildrenCount-1);event.preventDefault();this.manager.Transaction('Reorder tab',()=>pane.Children.Move(old,next));}return;
    }
    if(!editable&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?this.manager.Redo():this.manager.Undo();}
    else if(!editable&&event.ctrlKey&&event.key.toLowerCase()==='y'){event.preventDefault();this.manager.Redo();}
  }
  onKeyUp(event){if(this.navigator&&event.key==='Control')this.closeNavigator(true);}
  showNavigator() {
    if(this.navigator)return;
    const all=contents(this.manager.Layout).filter(x=>x.IsEnabled&&!x.IsHidden);
    this.navigatorItems=[...this.manager._mru.map(id=>all.find(x=>x.ContentId===id)).filter(Boolean),...all.filter(x=>!this.manager._mru.includes(x.ContentId))];
    if(!this.navigatorItems.length)return;
    this.navigatorIndex=0;this.navigatorFocus=this.doc.activeElement;
    const backdrop=element(this.doc,'div','ad-navigator-backdrop');const dialog=element(this.doc,'div','ad-navigator');dialog.tabIndex=-1;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Switch active window');
    dialog.append(element(this.doc,'div','ad-navigator-heading','Switch window'),element(this.doc,'div','ad-navigator-hint','Arrow keys to navigate · Enter to select · Esc to cancel'));
    const list=element(this.doc,'div','ad-navigator-list');list.setAttribute('role','listbox');
    this.navigatorRows=this.navigatorItems.map((model,index)=>{
      const row=element(this.doc,'button','ad-navigator-row');row.type='button';row.setAttribute('role','option');
      row.append(icon(this.doc,model instanceof LayoutDocument?'document':'tool'),element(this.doc,'span','',model.Title),element(this.doc,'small','',model instanceof LayoutDocument?'Document':model.IsAutoHidden?'Auto-hidden tool':'Tool window'));
      row.addEventListener('click',()=>{this.navigatorIndex=index;this.closeNavigator(true);});list.append(row);return row;
    });dialog.append(list);backdrop.append(dialog);backdrop.addEventListener('pointerdown',event=>{if(event.target===backdrop)this.closeNavigator(false);});
    this.host.append(backdrop);this.navigator=backdrop;this.updateNavigator();dialog.focus();
  }
  stepNavigator(delta){if(!this.navigator)return;this.navigatorIndex=(this.navigatorIndex+delta+this.navigatorItems.length)%this.navigatorItems.length;this.updateNavigator();}
  updateNavigator(){this.navigatorRows.forEach((row,index)=>{row.classList.toggle('ad-selected',index===this.navigatorIndex);row.setAttribute('aria-selected',String(index===this.navigatorIndex));});this.navigatorRows[this.navigatorIndex]?.scrollIntoView({block:'nearest'});}
  closeNavigator(commit){if(!this.navigator)return;const model=this.navigatorItems[this.navigatorIndex];this.navigator.remove();this.navigator=null;if(commit&&model){this.manager.Activate(model);this.focusContent(model);}else this.navigatorFocus?.focus({preventScroll:true});}
  popOut(subject) {
    const items=this.manager._subjectItems(subject);if(!items.length||!items.every(x=>x.CanFloat&&x.CanMove))return null;
    let model=subject instanceof LayoutFloatingWindow?subject:subject.FindParent(LayoutFloatingWindow);
    if(model&&this.popups.has(model.Id)){this.popups.get(model.Id).window.focus();return this.popups.get(model.Id).window;}
    const popup=this.win.open('about:blank',`${this.manager.Id}-${subject.Id}`,`popup,width=${Math.round(model?.FloatingWidth||640)},height=${Math.round(model?.FloatingHeight||440)}`);
    if(!popup){this.manager._emit('Error',{Error:new Error('The browser blocked this popup. Allow popups or use in-page floating windows.'),Operation:'Open browser window'});return null;}
    if(!model)model=this.manager.Float(subject);if(!model){popup.close();return null;}
    const doc=popup.document;doc.title=items[0].Title;
    for(const source of this.doc.querySelectorAll('link[rel="stylesheet"],style')){
      const clone=source.cloneNode(true);if(clone.tagName==='LINK')clone.href=source.href;doc.head.append(clone);
    }
    const style=doc.createElement('style');style.textContent='html,body{margin:0;width:100%;height:100%;overflow:hidden}.ad-popup-shell{display:flex;flex-direction:column;width:100%;height:100%}.ad-popup-toolbar{display:flex;align-items:center;padding:6px 10px;gap:10px;border-bottom:1px solid var(--ad-border);background:var(--ad-chrome);font:12px system-ui}.ad-popup-toolbar strong{flex:1}.ad-popup-body{flex:1;min-height:0;display:flex}.ad-popup-body>.ad-group,.ad-popup-body>.ad-content{flex:1}';doc.head.append(style);
    const shell=element(doc,'div','ad-manager ad-popup-shell');shell.dataset.theme=this.host.dataset.theme;shell.tabIndex=0;
    const bar=element(doc,'div','ad-popup-toolbar');bar.append(element(doc,'strong','',items[0].Title),button(doc,'dock','Dock back into workspace',()=>{const live=this.manager.FindById(model.Id);this.closePopup(model.Id);if(live)this.manager.Dock(live);}));
    const body=element(doc,'div','ad-popup-body');shell.append(bar,body);doc.body.replaceChildren(shell);
    const rec={window:popup,body,shell,modelId:model.Id,closing:false};this.popups.set(model.Id,rec);
    popup.addEventListener('beforeunload',()=>this.closePopup(model.Id,false));
    shell.addEventListener('keydown',event=>this.onKeyDown(event));shell.addEventListener('keyup',event=>this.onKeyUp(event));
    shell.addEventListener('focusin',event=>{const id=event.target.closest?.('[data-ad-content]')?.dataset.adContent;if(id){const item=this.manager.Find(id);if(item)this.manager.Activate(item);}});
    popup.addEventListener('resize',()=>{const live=this.manager.FindById(rec.modelId);if(!rec.closing&&live)this.manager.Transaction('Resize browser window',()=>{live.FloatingWidth=Math.max(220,popup.innerWidth);live.FloatingHeight=Math.max(140,popup.innerHeight);});});
    this.requestRender();return popup;
  }
  renderPopup(model,popup){popup.shell.dataset.theme=this.host.dataset.theme;const root=model.RootPanel;if(root)this.sync(popup.body,[this.renderNode(root)]);}
  closePopup(id,closeWindow=true){
    const rec=this.popups.get(id);if(!rec||rec.closing)return;rec.closing=true;
    for(const child of [...rec.body.children])moveNode(this.parking,child);
    this.popups.delete(id);if(closeWindow&&!rec.window.closed)rec.window.close();this.requestRender();
  }
  releaseContent(id){const rec=this.contentRecords.get(id);if(!rec)return;rec.dispose?.();rec.el.remove();this.contentRecords.delete(id);}
  dispose(){
    if(this.disposed)return;this.cancelInteraction();this.disposed=true;this.abort.abort();this.resizeObserver.disconnect();
    if(this.frame)this.win.cancelAnimationFrame(this.frame);clearTimeout(this.hoverTimer);clearTimeout(this.peekCloseTimer);
    for(const id of [...this.popups.keys()])this.closePopup(id);
    for(const rec of this.contentRecords.values())rec.dispose?.();
    this.contentRecords.clear();this.records.clear();this.tabs.clear();this.splitters.clear();
    this.host.replaceChildren(...this._originalNodes);this.host.className=this._oldClass;
    if(this._oldTabIndex==null)this.host.removeAttribute('tabindex');else this.host.setAttribute('tabindex',this._oldTabIndex);
    if(this._oldRole==null)this.host.removeAttribute('role');else this.host.setAttribute('role',this._oldRole);
    this.host.removeAttribute('aria-label');this.host.removeAttribute('data-theme');
  }
}

__exports.DockRenderer=DockRenderer;
},
"dom.js":function(__exports,__require){
const paths = {
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  pin: '<path d="m9 3 6 0-1 6 4 4v2H6v-2l4-4-1-6ZM12 15v6"/>',
  unpin: '<path d="m5 5 14 14M10 3h5l-1 6 4 4v2h-4M6 15h3l3 6v-6M7 10l-1 3"/>',
  float: '<path d="M13 4h7v7M20 4l-9 9M10 5H4v15h15v-6"/>',
  dock: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 9h16M14 9v11"/>',
  maximize: '<rect x="4" y="4" width="16" height="16" rx="1"/>',
  restore: '<path d="M8 8V4h12v12h-4"/><rect x="4" y="8" width="12" height="12" rx="1"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  document: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/>',
  tool: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M9 9v11"/>',
  left: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M10 4v16"/>',
  right: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M14 4v16"/>',
  top: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18"/>',
  bottom: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 14h18"/>',
  center: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M9 4v5"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  grip: '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/>',
  keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h1m4 0h1m4 0h1M6 12h1m4 0h1m4 0h1M7 16h10"/>'
};
function element(doc, tag, className = '', text = null) {
  const node = doc.createElement(tag); if (className) node.className = className;
  if (text != null) node.textContent = text; return node;
}
function icon(doc, name, size = 16) {
  const holder = element(doc, 'span', 'ad-icon');
  holder.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.tool}</svg>`;
  return holder;
}
function button(doc, glyph, title, callback, className = '') {
  const node = element(doc, 'button', `ad-button ${className}`); node.type = 'button';
  node.title = title; node.setAttribute('aria-label', title); if (glyph) node.append(icon(doc, glyph));
  node.addEventListener('click', event => { event.stopPropagation(); callback?.(event); }); return node;
}
/** Preserve live subtrees where the platform supports state-preserving moves. */
function moveNode(parent, node, before = null) {
  if (node === before) return;
  if (parent.moveBefore && node.isConnected && parent.isConnected && parent.ownerDocument === node.ownerDocument) {
    try { parent.moveBefore(node, before); return; } catch { /* Old browsers use ordinary DOM adoption. */ }
  }
  parent.insertBefore(node, before);
}
function syncChildren(parent, desired) {
  for (let index = 0; index < desired.length; index++) if (parent.children[index] !== desired[index]) moveNode(parent, desired[index], parent.children[index] || null);
  const keep = new Set(desired);
  for (const child of [...parent.children]) if (!keep.has(child)) child.remove();
}
function clamp(value, min, max) { return Math.min(Math.max(value, min), Math.max(min, max)); }
function rectRelative(rect, origin) { return { x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height }; }
function applyStyle(node, style, model, manager) {
  if (typeof style === 'function') style = style(model, manager);
  if (typeof style === 'string') node.classList.add(...style.split(/\s+/).filter(Boolean));
  else if (style && typeof style === 'object') for (const [key, value] of Object.entries(style)) {
    if (key.startsWith('--') || key.includes('-')) node.style.setProperty(key, String(value));
    else if (key in node.style) node.style[key] = value;
  }
}
function selectTemplate(manager, property, model, content = model) {
  const selector = manager[`${property}Selector`];
  return (typeof selector === 'function' ? selector(content, model, manager) : selector?.SelectTemplate?.(content, model)) || manager[property];
}

__exports.element=element;
__exports.icon=icon;
__exports.button=button;
__exports.moveNode=moveNode;
__exports.syncChildren=syncChildren;
__exports.clamp=clamp;
__exports.rectRelative=rectRelative;
__exports.applyStyle=applyStyle;
__exports.selectTemplate=selectTemplate;
},
"web-component.js":function(__exports,__require){
const { DockingManager }=__require("manager.js");
const { LayoutTypes, LayoutRoot, LayoutPanel, LayoutContent, LayoutAnchorSide }=__require("model.js");
const { getSchema }=__require("events.js");
const HTMLElementBase = globalThis.HTMLElement || class {};
const names=Object.fromEntries(Object.entries(LayoutTypes).map(([name,Type])=>[name.toLowerCase(),Type]));
function parseLayoutElement(element) {
  const normalized=element.localName.replace(/-/g,'').toLowerCase(),Type=names[normalized];
  if(!Type)throw new TypeError(`Unknown declarative layout element: ${element.localName}`);
  const model=new Type(),schema=getSchema(Type),lookup=Object.fromEntries([...Object.keys(schema),'Id','IsSelected','IsActive','SelectedContentIndex'].map(key=>[key.toLowerCase(),key]));
  for(const attr of element.attributes){
    const key=lookup[attr.name.replace(/-/g,'').toLowerCase()];if(!key)continue;
    if(key==='SelectedContentIndex'||key==='IsActive'||key==='IsSelected')continue;
    let value=attr.value;const defaultValue=schema[key]?.default;
    if(typeof defaultValue==='boolean')value=value===''||value.toLowerCase()==='true';else if(typeof defaultValue==='number')value=Number(value);
    model[key]=value;
  }
  if(model instanceof LayoutContent){
    const container=element.ownerDocument.createElement('div');container.className='ad-user-content';container.style.cssText='height:100%;min-height:0;overflow:auto';
    const template=element.querySelector(':scope > template');
    if(template)container.append(template.content.cloneNode(true));else container.append(...element.childNodes);
    model.Content=container;
  }else if(model instanceof LayoutRoot){
    for(const child of [...element.children]){
      const tag=child.localName.replace(/-/g,'').toLowerCase();
      if(tag==='layoutpanel')model.RootPanel=parseLayoutElement(child);
      else if(['leftside','rightside','topside','bottomside'].includes(tag)){
        const side=tag.replace('side','');const name=side[0].toUpperCase()+side.slice(1);const sideModel=new LayoutAnchorSide({Side:name});
        for(const group of [...child.children])sideModel.Children.Add(parseLayoutElement(group));model[`${name}Side`]=sideModel;
      }else if(tag==='floatingwindows'||tag==='hidden')for(const item of [...child.children])model[tag==='hidden'?'Hidden':'FloatingWindows'].Add(parseLayoutElement(item));
      else throw new TypeError(`Unexpected LayoutRoot child: ${child.localName}`);
    }
  }else for(const child of [...element.children])model.Children.Add(parseLayoutElement(child));
  if(element.hasAttribute('selected-content-index'))model.SelectedContentIndex=Number(element.getAttribute('selected-content-index'));
  if(element.getAttribute('is-selected')==='true')model.IsSelected=true;
  if(element.getAttribute('is-active')==='true')model.IsActive=true;
  return model;
}
class AvalonDockElement extends HTMLElementBase {
  static get observedAttributes(){return['theme','dir'];}
  connectedCallback(){
    if(this.manager)return;
    queueMicrotask(()=>{
      if(!this.isConnected||this.manager)return;
      const definition=[...this.children].find(child=>child.localName.replace(/-/g,'').toLowerCase()==='layoutroot');
      const layout=this._layout||(definition?parseLayoutElement(definition):null);
      definition?.remove();
      this.manager=new DockingManager(this,{...(this.options||{}),...(layout?{Layout:layout}:{}),Theme:this.getAttribute('theme')||this.options?.Theme||'dark',FlowDirection:this.getAttribute('dir')==='rtl'?'RightToLeft':'LeftToRight'});
      this.dispatchEvent(new CustomEvent('ready',{detail:{manager:this.manager},bubbles:true}));
    });
  }
  disconnectedCallback(){queueMicrotask(()=>{if(!this.isConnected&&this.manager){this._layout=this.manager.Layout;this.manager.Dispose();this.manager=null;}});}
  attributeChangedCallback(name,_old,value){if(!this.manager)return;if(name==='theme')this.manager.Theme=value||'dark';if(name==='dir')this.manager.FlowDirection=value==='rtl'?'RightToLeft':'LeftToRight';}
  get Layout(){return this.manager?.Layout||this._layout||null;}
  set Layout(value){if(this.manager)this.manager.Layout=value;else this._layout=value;}
  get DockingManager(){return this.manager;}
}
function registerAvalonDock(tagName='avalon-dock') {
  if(typeof customElements==='undefined')return false;
  if(!customElements.get(tagName))customElements.define(tagName,tagName==='avalon-dock'?AvalonDockElement:class extends AvalonDockElement{});
  return true;
}
registerAvalonDock();

__exports.parseLayoutElement=parseLayoutElement;
__exports.AvalonDockElement=AvalonDockElement;
__exports.registerAvalonDock=registerAvalonDock;
}};
const __cache={};function __require(name){if(__cache[name])return __cache[name];const exports=__cache[name]={};__modules[name](exports,__require);return exports;}
const api=__require('index.js');global.AvalonDock=api.AvalonDock;global.Xceed||={};global.Xceed.Wpf||={};global.Xceed.Wpf.AvalonDock=api.AvalonDock;
})(globalThis);
