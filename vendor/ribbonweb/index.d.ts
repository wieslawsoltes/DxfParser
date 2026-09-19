/** Public TypeScript declarations for the dependency-free RibbonWeb modules. */
export type PascalCaseAliases<T> = {
  [K in keyof T as K extends string ? Capitalize<K> : never]: T[K];
};
export type CamelCaseAliases<T> = {
  [K in keyof T as K extends string ? Uncapitalize<K> : never]: T[K];
};
export type DotNetOptions<T> = Partial<T> & Partial<PascalCaseAliases<T>>;
export interface Disposable {
  dispose(): void;
  Dispose(): void;
}
/** Subscription handles are callable and also expose both disposal conventions. */
export interface Subscription extends Disposable {
  (): void;
}
export class EventSource<TArgs extends unknown[] = unknown[]> {
  subscribe(listener: (...args: TArgs) => void): Subscription;
  Subscribe(listener: (...args: TArgs) => void): Subscription;
  emit(...args: TArgs): void;
  Emit(...args: TArgs): void;
  clear(): void;
  readonly count: number;
}
export interface PropertyChangedEvent<T = unknown> {
  sender: unknown;
  propertyName: string;
  name: string;
  oldValue: T;
  newValue: T;
  value: T;
  Sender: unknown;
  PropertyName: string;
  OldValue: T;
  NewValue: T;
}
export interface ObservableObject<T extends object = Record<string, unknown>> extends Disposable {
  readonly PropertyChanged: EventSource<[PropertyChangedEvent]>;
  readonly propertyChanged: EventSource<[PropertyChangedEvent]>;
  GetProperty<K extends keyof T & string>(name: K): T[K];
  GetProperty(name: string): unknown;
  SetProperty<K extends keyof T & string>(name: K, value: T[K]): boolean;
  SetProperty(name: string, value: unknown): boolean;
  get<K extends keyof T & string>(path: K): T[K];
  get(path: string): unknown;
  set(path: string, value: unknown): boolean;
  toJSON(): Record<string, unknown>;
}
/** The returned instance infers both camelCase and PascalCase property accessors. */
export const ObservableObject: {
  new <T extends object = Record<string, unknown>>(
    initial?: T,
  ): ObservableObject<CamelCaseAliases<T>> & CamelCaseAliases<T> & PascalCaseAliases<T>;
  readonly prototype: ObservableObject;
};
export type CollectionAction = 'add' | 'remove' | 'move' | 'replace' | 'reset';
export interface CollectionChangedEvent<T> {
  sender: ObservableCollection<T>;
  action: CollectionAction;
  newItems: T[];
  oldItems: T[];
  index: number;
  oldIndex: number;
  Sender: ObservableCollection<T>;
  Action: Capitalize<CollectionAction>;
  NewItems: T[];
  OldItems: T[];
  NewStartingIndex: number;
  OldStartingIndex: number;
}
export class ObservableCollection<T = unknown> implements Iterable<T> {
  constructor(items?: Iterable<T>);
  readonly Items: T[];
  readonly items: T[];
  readonly Count: number;
  readonly count: number;
  readonly length: number;
  readonly CollectionChanged: EventSource<[CollectionChangedEvent<T>]>;
  readonly collectionChanged: EventSource<[CollectionChangedEvent<T>]>;
  readonly PropertyChanged: EventSource<[PropertyChangedEvent]>;
  readonly propertyChanged: EventSource<[PropertyChangedEvent]>;
  [Symbol.iterator](): Iterator<T>;
  at(index: number): T | undefined;
  map<U>(callback: (value: T, index: number, array: T[]) => U, thisArg?: unknown): U[];
  forEach(callback: (value: T, index: number, array: T[]) => void, thisArg?: unknown): void;
  Add(item: T): number;
  add(item: T): number;
  Insert(index: number, item: T): number;
  insert(index: number, item: T): number;
  Remove(item: T): boolean;
  remove(item: T): boolean;
  RemoveAt(index: number): T;
  removeAt(index: number): T;
  Move(oldIndex: number, newIndex: number): void;
  move(oldIndex: number, newIndex: number): void;
  SetItem(index: number, item: T): void;
  setItem(index: number, item: T): void;
  Clear(): void;
  clear(): void;
  toJSON(): unknown[];
}
export interface CommandChangedEvent {
  sender: unknown;
  Sender: unknown;
}
export interface ICommand<TParameter = unknown, TResult = unknown> {
  Execute(parameter?: TParameter): TResult | undefined;
  CanExecute(parameter?: TParameter): boolean;
  CanExecuteChanged?: EventSource<[CommandChangedEvent]>;
}
export interface WebCommand<TParameter = unknown, TResult = unknown> {
  execute(parameter?: TParameter): TResult | undefined;
  canExecute?(parameter?: TParameter): boolean;
  canExecuteChanged?: EventSource<[CommandChangedEvent]>;
}
export class RelayCommand<TParameter = unknown, TResult = unknown>
  implements ICommand<TParameter, TResult>, WebCommand<TParameter, TResult>
{
  constructor(
    execute: (parameter: TParameter) => TResult,
    canExecute?: (parameter: TParameter) => boolean,
  );
  readonly CanExecuteChanged: EventSource<[CommandChangedEvent]>;
  readonly canExecuteChanged: EventSource<[CommandChangedEvent]>;
  Execute(parameter?: TParameter): TResult | undefined;
  execute(parameter?: TParameter): TResult | undefined;
  CanExecute(parameter?: TParameter): boolean;
  canExecute(parameter?: TParameter): boolean;
  NotifyCanExecuteChanged(): void;
  notifyCanExecuteChanged(): void;
}
export interface AsyncCommandState {
  isRunning: boolean;
  isCancellationRequested: boolean;
  error: unknown;
}
export interface AsyncRelayCommand<TParameter = unknown, TResult = unknown>
  extends ObservableObject<AsyncCommandState>,
    AsyncCommandState,
    PascalCaseAliases<AsyncCommandState>,
    ICommand<TParameter, Promise<TResult | undefined>>,
    WebCommand<TParameter, Promise<TResult | undefined>> {
  readonly CanExecuteChanged: EventSource<[CommandChangedEvent]>;
  readonly canExecuteChanged: EventSource<[CommandChangedEvent]>;
  Execute(parameter?: TParameter): Promise<TResult | undefined>;
  execute(parameter?: TParameter): Promise<TResult | undefined>;
  CanExecute(parameter?: TParameter): boolean;
  canExecute(parameter?: TParameter): boolean;
  Cancel(): void;
  cancel(): void;
  NotifyCanExecuteChanged(): void;
  notifyCanExecuteChanged(): void;
}
export const AsyncRelayCommand: {
  new <TParameter = unknown, TResult = unknown>(
    execute: (parameter: TParameter, signal: AbortSignal) => TResult | PromiseLike<TResult>,
    canExecute?: (parameter: TParameter) => boolean,
  ): AsyncRelayCommand<TParameter, TResult>;
  readonly prototype: AsyncRelayCommand;
};
export type BindingMode = 'OneWay' | 'TwoWay' | 'OneTime';
export interface ValueConverter<TSource = unknown, TTarget = unknown> {
  convert?(value: TSource, parameter?: unknown): TTarget;
  Convert?(value: TSource, parameter?: unknown): TTarget;
  convertBack?(value: TTarget, parameter?: unknown): TSource;
  ConvertBack?(value: TTarget, parameter?: unknown): TSource;
}
export interface BindingSettings<TSource = unknown, TTarget = unknown> {
  mode: BindingMode;
  converter: ValueConverter<TSource, TTarget> | ((value: TSource, parameter?: unknown) => TTarget);
  converterParameter: unknown;
  fallbackValue: TTarget;
}
export type BindingOptions<TSource = unknown, TTarget = unknown> = DotNetOptions<
  BindingSettings<TSource, TTarget>
>;
export class Binding<TSource = unknown, TTarget = unknown> {
  constructor(path: string, options?: BindingOptions<TSource, TTarget>);
  readonly path: string;
  readonly Path: string;
  readonly mode: BindingMode;
  readonly Mode: BindingMode;
  readonly converter?: BindingSettings<TSource, TTarget>['converter'];
  readonly Converter?: BindingSettings<TSource, TTarget>['converter'];
  readonly converterParameter?: unknown;
  readonly fallbackValue?: TTarget;
}
export type BindingDefinition =
  | string
  | Binding<any, any>
  | (BindingOptions<any, any> & ({ path: string } | { Path: string }));
export interface BindingSubscription extends Subscription {
  updateTarget(): void;
  updateSource(): void;
}
export function bind(
  target: object,
  targetProperty: string,
  source: object,
  binding: BindingDefinition,
): BindingSubscription;

export type RibbonControlType =
  | 'button'
  | 'toggle'
  | 'checkbox'
  | 'radio'
  | 'split'
  | 'menu'
  | 'menuitem'
  | 'textbox'
  | 'combobox'
  | 'dropdown'
  | 'spinner'
  | 'slider'
  | 'gallery'
  | 'color'
  | 'separator'
  | 'label'
  | 'custom';
export type RibbonLayout = 'classic' | 'simplified';
export type RibbonTheme = 'light' | 'dark' | 'system';
export type RibbonSize = 'small' | 'medium' | 'large';
export type RibbonCollection<T> = T[] | ObservableCollection<T> | Iterable<T>;
export type RibbonCommand =
  | ICommand<any, any>
  | WebCommand<any, any>
  | ((parameter: any, control: RibbonControl) => unknown)
  | null;
export interface RibbonOption {
  id?: string;
  value?: unknown;
  label?: string;
  icon?: string;
  preview?: string;
  category?: string;
  style?: Partial<
    Pick<
      CSSStyleDeclaration,
      | 'fontFamily'
      | 'fontSize'
      | 'fontWeight'
      | 'fontStyle'
      | 'color'
      | 'backgroundColor'
      | 'textDecoration'
      | 'textAlign'
      | 'borderColor'
    >
  >;
  Id?: string;
  Value?: unknown;
  Label?: string;
}
export type RibbonItem = RibbonControl | RibbonControlOptions | RibbonOption | string | number;
export interface RibbonControlState {
  id: string;
  type: RibbonControlType;
  label: string;
  icon: string;
  keyTip: string;
  tooltip: string;
  description: string;
  command: RibbonCommand;
  commandParameter: unknown;
  enabled: boolean;
  visible: boolean;
  checked: boolean;
  value: unknown;
  items: RibbonItem[];
  size: RibbonSize;
  bindings: Record<string, BindingDefinition> | null;
}
export interface RibbonControlExtensions {
  text?: string;
  shortcut?: string;
  allowInInput?: boolean;
  groupName?: string;
  min?: number;
  max?: number;
  step?: number | 'any';
  placeholder?: string;
  maxLength?: number;
  width?: string | number;
  showLabel?: boolean;
  showIcon?: boolean;
  inlineCount?: number;
  columns?: number;
  slot?: string;
  busy?: boolean;
  render?: (context: {
    control: RibbonControl;
    ribbon: RibbonElement;
    document: Document;
  }) => Node | null | undefined;
  getItems?: (
    control: RibbonControl,
  ) =>
    | RibbonCollection<RibbonControl | RibbonControlOptions | string>
    | PromiseLike<RibbonCollection<RibbonControl | RibbonControlOptions | string>>;
  validate?: (value: unknown) => boolean;
  validationMessage?: string;
  onChange?: (value: unknown, control: RibbonControl) => unknown;
  preview?: (value: unknown, item: RibbonOption) => void;
  cancelPreview?: () => void;
}
export interface RibbonControlSemanticAliases {
  isEnabled: boolean;
  isVisible: boolean;
  isChecked: boolean;
  header: string;
  itemsSource: RibbonCollection<RibbonItem>;
  selectedValue: unknown;
  smallImageSource: string;
  largeImageSource: string;
  toolTipTitle: string;
  toolTipDescription: string;
}
export type RibbonControlOptions = DotNetOptions<Omit<RibbonControlState, 'items' | 'type'>> &
  DotNetOptions<RibbonControlExtensions> &
  DotNetOptions<RibbonControlSemanticAliases> & {
    type?: RibbonControlType | string;
    Type?: RibbonControlType | string;
    items?: RibbonCollection<RibbonItem>;
    Items?: RibbonCollection<RibbonItem>;
  };
export interface RibbonControl
  extends ObservableObject<RibbonControlState>,
    RibbonControlState,
    PascalCaseAliases<RibbonControlState>,
    RibbonControlExtensions,
    PascalCaseAliases<RibbonControlExtensions>,
    RibbonControlSemanticAliases,
    PascalCaseAliases<RibbonControlSemanticAliases> {}
export const RibbonControl: {
  new (options?: RibbonControlOptions, type?: RibbonControlType): RibbonControl;
  readonly prototype: RibbonControl;
};
export class RibbonButton extends RibbonControl {
  constructor(options?: RibbonControlOptions);
}
export class RibbonToggleButton extends RibbonControl {
  constructor(options?: RibbonControlOptions);
}
export class RibbonCheckBox extends RibbonControl {
  constructor(options?: RibbonControlOptions);
}
export class RibbonRadioButton extends RibbonControl {
  constructor(options?: RibbonControlOptions);
}
export class RibbonSplitButton extends RibbonControl {
  constructor(options?: RibbonControlOptions);
}
export class RibbonMenuButton extends RibbonControl {
  constructor(options?: RibbonControlOptions);
}
export class RibbonMenuItem extends RibbonControl {
  constructor(options?: RibbonControlOptions);
}
export class RibbonTextBox extends RibbonControl {
  constructor(options?: RibbonControlOptions);
  text: string;
  Text: string;
}
export class RibbonComboBox extends RibbonControl {
  constructor(options?: RibbonControlOptions);
  text: string;
  Text: string;
}
export class RibbonDropDown extends RibbonControl {
  constructor(options?: RibbonControlOptions);
}
export class RibbonSpinner extends RibbonControl {
  constructor(options?: RibbonControlOptions);
}
export class RibbonSlider extends RibbonControl {
  constructor(options?: RibbonControlOptions);
}
export class RibbonGallery extends RibbonControl {
  constructor(options?: RibbonControlOptions);
}
export class RibbonColorPicker extends RibbonControl {
  constructor(options?: RibbonControlOptions);
}
export class RibbonSeparator extends RibbonControl {
  constructor(options?: RibbonControlOptions);
}
export class RibbonLabel extends RibbonControl {
  constructor(options?: RibbonControlOptions);
}
export class RibbonCustomControl extends RibbonControl {
  constructor(options?: RibbonControlOptions);
}
export interface RibbonGroupState {
  id: string;
  header: string;
  items: RibbonControl[];
  priority: number;
  visible: boolean;
  launcher: RibbonControl | RibbonCommand | ((group: RibbonGroup) => unknown);
}
export interface RibbonGroupSemanticAliases {
  isVisible: boolean;
  itemsSource: RibbonCollection<RibbonControl | RibbonControlOptions | string>;
}
export type RibbonGroupOptions = DotNetOptions<Omit<RibbonGroupState, 'items' | 'launcher'>> &
  DotNetOptions<RibbonGroupSemanticAliases> & {
    items?: RibbonCollection<RibbonControl | RibbonControlOptions | string>;
    Items?: RibbonCollection<RibbonControl | RibbonControlOptions | string>;
    launcher?: RibbonGroupState['launcher'] | RibbonControlOptions;
    Launcher?: RibbonGroupState['launcher'] | RibbonControlOptions;
    bindings?: Record<string, BindingDefinition>;
    Bindings?: Record<string, BindingDefinition>;
  };
export interface RibbonGroup
  extends ObservableObject<RibbonGroupState>,
    RibbonGroupState,
    PascalCaseAliases<RibbonGroupState>,
    RibbonGroupSemanticAliases,
    PascalCaseAliases<RibbonGroupSemanticAliases> {}
export const RibbonGroup: {
  new (options?: RibbonGroupOptions): RibbonGroup;
  readonly prototype: RibbonGroup;
};
export interface RibbonTabState {
  id: string;
  header: string;
  keyTip: string;
  groups: RibbonGroup[];
  visible: boolean;
  contextualGroup: string | null;
}
export type RibbonTabOptions = DotNetOptions<Omit<RibbonTabState, 'groups'>> & {
  groups?: RibbonCollection<RibbonGroup | RibbonGroupOptions>;
  Groups?: RibbonCollection<RibbonGroup | RibbonGroupOptions>;
  contextColor?: string;
  ContextColor?: string;
  isVisible?: boolean;
  IsVisible?: boolean;
  bindings?: Record<string, BindingDefinition>;
  Bindings?: Record<string, BindingDefinition>;
};
export interface RibbonTab
  extends ObservableObject<RibbonTabState>,
    RibbonTabState,
    PascalCaseAliases<RibbonTabState> {
  contextColor?: string;
  ContextColor?: string;
  isVisible: boolean;
  IsVisible: boolean;
}
export const RibbonTab: {
  new (options?: RibbonTabOptions): RibbonTab;
  readonly prototype: RibbonTab;
};
export interface RibbonBackstageOptions {
  header?: string;
  Header?: string;
  items?: RibbonCollection<RibbonControl | RibbonControlOptions>;
  Items?: RibbonCollection<RibbonControl | RibbonControlOptions>;
}
export interface RibbonModelState {
  id: string;
  tabs: RibbonTab[];
  quickAccessToolbar: RibbonControl[];
  backstage: RibbonControl[] | RibbonBackstageOptions;
  selectedTab: string | null;
  layout: RibbonLayout;
  theme: RibbonTheme;
  context: Record<string, boolean>;
}
export interface RibbonModelExtensions {
  title?: string;
  fileLabel?: string;
  storageKey?: string;
}
export type RibbonModelOptions = DotNetOptions<
  Omit<RibbonModelState, 'tabs' | 'quickAccessToolbar' | 'backstage'>
> &
  DotNetOptions<RibbonModelExtensions> & {
    tabs?: RibbonCollection<RibbonTab | RibbonTabOptions>;
    Tabs?: RibbonCollection<RibbonTab | RibbonTabOptions>;
    quickAccessToolbar?: RibbonCollection<RibbonControl | RibbonControlOptions | string>;
    QuickAccessToolbar?: RibbonCollection<RibbonControl | RibbonControlOptions | string>;
    backstage?:
      | RibbonCollection<RibbonControl | RibbonControlOptions | string>
      | RibbonBackstageOptions;
    Backstage?:
      | RibbonCollection<RibbonControl | RibbonControlOptions | string>
      | RibbonBackstageOptions;
  };
export interface RibbonModel
  extends ObservableObject<RibbonModelState>,
    RibbonModelState,
    PascalCaseAliases<RibbonModelState>,
    RibbonModelExtensions,
    PascalCaseAliases<RibbonModelExtensions> {}
export const RibbonModel: {
  new (options?: RibbonModelOptions): RibbonModel;
  readonly prototype: RibbonModel;
};
export function normalizeRibbon(model?: RibbonModel | RibbonModelOptions): RibbonModel;
export function normalizeControl(
  control: RibbonControl | RibbonControlOptions | string,
  defaultType?: RibbonControlType,
): RibbonControl;
export function traverseControls(
  ribbon: RibbonModel | RibbonModelOptions,
): Generator<RibbonControl>;
export function findControl(
  ribbon: RibbonModel | RibbonModelOptions,
  id: string,
): RibbonControl | undefined;

export interface RibbonCustomization {
  version: 1;
  selectedTab?: string;
  layout: RibbonLayout;
  theme: RibbonTheme;
  minimized: boolean;
  hiddenTabs: string[];
  hiddenGroups: string[];
  quickAccessToolbar: string[] | null;
  tabOrder: string[];
  tabLabels: Record<string, string>;
  groupOrder: Record<string, string[]>;
}
export interface RibbonCommandEventDetail {
  id: string;
  value: unknown;
  parameter: unknown;
  control: RibbonControl;
}
export interface RibbonChangeEventDetail {
  id: string;
  property: string;
  value: unknown;
}
export interface RibbonEventMap {
  'ribbon-command-executing': CustomEvent<RibbonCommandEventDetail>;
  'ribbon-command': CustomEvent<RibbonCommandEventDetail>;
  'ribbon-change': CustomEvent<RibbonChangeEventDetail>;
  'ribbon-tab-change': CustomEvent<{ id: string }>;
  'ribbon-context-change': CustomEvent<{ name: string; active: boolean }>;
  'ribbon-backstage-change': CustomEvent<{ open: boolean; id?: string }>;
  'ribbon-preview': CustomEvent<{ id: string; value: unknown; item?: RibbonOption }>;
  'ribbon-preview-end': CustomEvent<{ id: string; committed: boolean; value?: unknown }>;
  'ribbon-launcher': CustomEvent<{ id: string }>;
  'ribbon-error': CustomEvent<{ id?: string; error: unknown }>;
  'ribbon-storage-error': CustomEvent<{ error: unknown }>;
  'ribbon-customization-change': CustomEvent<RibbonCustomization>;
  'ribbon-dotnet-error': CustomEvent<{ error: unknown; event: DotNetRibbonEvent }>;
}
export class RibbonElement extends HTMLElement {
  constructor();
  static readonly observedAttributes: string[];
  get model(): RibbonModel;
  set model(value: RibbonModel | RibbonModelOptions);
  get Model(): RibbonModel;
  set Model(value: RibbonModel | RibbonModelOptions);
  dataContext: object | undefined;
  DataContext: object | undefined;
  selectedTab: string | undefined;
  SelectedTab: string | undefined;
  layout: RibbonLayout;
  theme: RibbonTheme;
  minimized: boolean;
  connectedCallback(): void;
  disconnectedCallback(): void;
  attributeChangedCallback(): void;
  requestRender(): void;
  render(): void;
  invalidate(): void;
  Invalidate(): void;
  updateControl(id: string, changes: RibbonControlOptions): RibbonControl;
  UpdateControl(id: string, changes: RibbonControlOptions): RibbonControl;
  getControl(id: string): RibbonControl | undefined;
  GetControl(id: string): RibbonControl | undefined;
  setContext(name: string, active?: boolean): void;
  SetContext(name: string, active?: boolean): void;
  selectTab(id: string): boolean;
  ActivateTab(id: string): boolean;
  execute(
    idOrControl: string | RibbonControl | RibbonControlOptions,
    value?: unknown,
  ): Promise<boolean>;
  Execute(
    idOrControl: string | RibbonControl | RibbonControlOptions,
    value?: unknown,
  ): Promise<boolean>;
  closePopup(restore?: boolean): void;
  openBackstage(id?: string): void;
  closeBackstage(): void;
  openSearch(anchor?: HTMLElement | null): void;
  showContextMenu(
    items: Array<string | RibbonControl | RibbonControlOptions>,
    position?: { x?: number; y?: number },
  ): void;
  showMiniToolbar(
    items: Array<string | RibbonControl | RibbonControlOptions>,
    position?: { x?: number; y?: number },
  ): void;
  openQuickAccessMenu(): void;
  exportCustomization(): RibbonCustomization;
  importCustomization(data: RibbonCustomization): void;
  saveCustomization(): RibbonCustomization;
  loadCustomization(): void;
  resetCustomization(): void;
  openCustomization(): void;
  addTab(tab: RibbonTabOptions | RibbonTab, index?: number): RibbonTab;
  removeTab(id: string): boolean;
  addGroup(tabId: string, group: RibbonGroupOptions | RibbonGroup, index?: number): RibbonGroup;
  addControl(
    groupId: string,
    control: RibbonControlOptions | RibbonControl,
    index?: number,
  ): RibbonControl;
  removeControl(id: string): boolean;
  setQuickAccess(ids: string[]): void;
  addToQuickAccess(id: string): void;
  removeFromQuickAccess(id: string): void;
  moveQuickAccess(id: string, index: number): boolean;
  AddTab(tab: RibbonTabOptions | RibbonTab, index?: number): RibbonTab;
  RemoveTab(id: string): boolean;
  AddGroup(tabId: string, group: RibbonGroupOptions | RibbonGroup, index?: number): RibbonGroup;
  AddControl(
    groupId: string,
    control: RibbonControlOptions | RibbonControl,
    index?: number,
  ): RibbonControl;
  RemoveControl(id: string): boolean;
  addEventListener<K extends keyof RibbonEventMap>(
    type: K,
    listener: (this: RibbonElement, event: RibbonEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: HTMLElement, event: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof RibbonEventMap>(
    type: K,
    listener: (this: RibbonElement, event: RibbonEventMap[K]) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: HTMLElement, event: HTMLElementEventMap[K]) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void;
}
export function registerRibbon(tagName?: string): CustomElementConstructor | undefined;
export function createIcon(name: string, doc?: Document): HTMLSpanElement;

declare global {
  interface HTMLElementTagNameMap {
    'ribbon-web': RibbonElement;
  }
}

export interface RibbonXControlDescriptor {
  readonly id: string;
  readonly Id: string;
  readonly tag: string;
  readonly idMso?: string;
  readonly idQ?: string;
}
export interface RibbonXWarning {
  code: string;
  message: string;
  id?: string;
}
export type RibbonXCallbacks = Record<string, (...args: any[]) => unknown>;
export interface RibbonXOptions {
  DOMParser?: new () => DOMParser;
  maxXmlLength?: number;
  maxItems?: number;
  loadDynamicMenus?: boolean;
  resolveImage?: (image: unknown, control: RibbonXControlDescriptor) => string;
  onWarning?: (warning: RibbonXWarning) => void;
  onError?: (error: unknown, control: RibbonXControlDescriptor) => void;
}
export type RibbonXModel = RibbonModelOptions & { ribbonX?: { warnings: RibbonXWarning[] } };
export interface RibbonXAdapter {
  readonly model: RibbonXModel;
  readonly warnings: RibbonXWarning[];
  Invalidate(): boolean;
  InvalidateControl(id: string): boolean;
  ActivateTab(id: string): boolean;
  attach(element: RibbonElement): this;
  dispose(): void;
}
export function parseRibbonXml(
  xml: string,
  callbacks?: RibbonXCallbacks,
  options?: RibbonXOptions,
): RibbonXModel;
export function createRibbonXAdapter(
  xml: string,
  callbacks?: RibbonXCallbacks,
  options?: RibbonXOptions,
): RibbonXAdapter;
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export interface DotNetRibbonEvent {
  type: 'ribbon-command' | 'ribbon-change' | 'ribbon-tab-change';
  id: string;
  value?: JsonValue;
  parameter?: JsonValue;
}
export interface DotNetObjectReference {
  invokeMethodAsync(methodName: string, ...args: unknown[]): PromiseLike<unknown>;
}
export interface DotNetBridgeOptions {
  methodName?: string;
  onError?: (error: unknown, event: DotNetRibbonEvent) => void;
}
export interface DotNetBridge {
  setModel(model: RibbonModel | RibbonModelOptions): void;
  setDataContext(dataContext: object): void;
  updateControl(id: string, changes: RibbonControlOptions): RibbonControl;
  setContext(name: string, active: boolean): void;
  selectTab(id: string): boolean;
  flush(): Promise<void>;
  dispose(): void;
}
export function createDotNetBridge(
  ribbon: RibbonElement,
  dotNetObject: DotNetObjectReference,
  options?: DotNetBridgeOptions,
): DotNetBridge;
