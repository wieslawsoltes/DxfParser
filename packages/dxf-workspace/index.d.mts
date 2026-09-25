export type BrowserRealm = Window & typeof globalThis;
export type Theme = 'light' | 'dark' | 'contrast';
export interface WorkspaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
/** Host-owned Dockyard objects remain accessible without bundling another API instance. */
export interface DockModel {
  ContentId: string;
  Title: string;
  IsHidden: boolean;
  IsFloating: boolean;
  Activate(): void;
  Close(): void;
  Hide(): void;
  Show(): void;
}
export interface DockManager {
  Find(id: string): DockModel | null;
  Theme: string | { Name: string };
  CanUndo: boolean;
  CanRedo: boolean;
  SaveLayout(): string;
  Undo(): void;
  Redo(): void;
  Dispose(): void;
}
export interface PanelDefinition {
  id: string;
  title: string;
  node: HTMLElement;
  kind?: 'tool' | 'document';
  side?: 'Left' | 'Right' | 'Top' | 'Bottom';
  closable?: boolean;
  floating?: boolean;
  keepOpen?: boolean;
  isModified?: boolean;
  bridge?: 'hidden' | 'style' | null;
  display?: string;
  manageAria?: boolean;
  toggleButton?: HTMLElement;
  resizeNode?: HTMLElement;
  titleNode?: HTMLElement;
  width?: number;
  height?: number;
  onResize?(rect: DOMRect): void;
  onVisibility?(visible: boolean): void;
  onClose?(): void;
  openAction?(): void;
}
export interface WorkspaceOptions {
  id: string;
  title: string;
  shell: HTMLElement;
  panels: PanelDefinition[];
  presets: string[];
  defaultPreset: string;
  theme?: Theme;
  deferRestore?: boolean;
  layout(workspace: Workspace, preset: string): object;
  onPreset?(preset: string, workspace: Workspace): void;
  onRestore?(workspace: Workspace): void;
  shouldRestorePanel?(panel: PanelDefinition, workspace: Workspace): boolean;
}
export interface Workspace {
  readonly api: object;
  readonly manager: DockManager;
  readonly id: string;
  readonly storageKey: string;
  readonly host: HTMLElement;
  readonly parking: HTMLElement;
  readonly toolbar: HTMLElement;
  readonly status: HTMLElement;
  readonly definitions: Map<string, PanelDefinition>;
  readonly disposed: boolean;
  ready: boolean;
  preset: string;
  register(definition: PanelDefinition): PanelDefinition;
  unregister(id: string): void;
  require(id: string): PanelDefinition;
  make(id: string): DockModel;
  show(id: string, options?: { floating?: boolean; activate?: boolean }): DockModel;
  hide(id: string): boolean;
  isOpen(id: string): boolean;
  setVisible(id: string, visible: boolean): DockModel | boolean;
  requestOpen(id: string): void;
  dismissAfterNavigation(id: string): boolean;
  syncPresentation(cleanup?: boolean): void;
  scheduleResize(): void;
  changed(): void;
  exportLayout(): string;
  importLayout(text: string): void;
  applyPreset(preset: string): void;
  clampFloatingWindows(): void;
  save(): boolean;
  restore(): void;
  notify(message: string, error?: boolean): void;
  onDispose(callback: () => void): () => void;
  dispose(): void;
}
export const FORMAT: 'dxfparser-dockyard-workspace';
export const VERSION: 1;
export const MAX_LAYOUT_BYTES: number;
export function createDockingWorkspace(host: {
  window: BrowserRealm;
  dockyard: object;
  /** undefined uses realm storage lazily; null disables persistence. */
  storage?: WorkspaceStorage | null;
  storagePrefix?: string;
}): {
  Workspace: new (options: WorkspaceOptions) => Workspace;
  element(tag: string, className?: string, text?: string): HTMLElement;
  FORMAT: typeof FORMAT;
  VERSION: typeof VERSION;
  MAX_LAYOUT_BYTES: number;
};
