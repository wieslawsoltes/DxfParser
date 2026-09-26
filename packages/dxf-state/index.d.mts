export type StateId = string | number;
export type ColumnWidths = Record<string, number | '*' | 'auto' | `${number}*`>;
export interface StateLimits {
    maxBytes: number; maxTabs: number; maxTreeNodes: number; maxDepth: number; maxValues: number;
}
export const DEFAULT_STATE_LIMITS: Readonly<StateLimits>;
export function stateLimits(options?: Partial<StateLimits>): Readonly<StateLimits>;
export interface SourceNode {
    id: StateId; type: string; expanded?: boolean; children?: SourceNode[];
    properties?: {code: number; value: string; line?: number | string}[];
    [metadata: string]: unknown;
}
export interface SourceTab {
    id: StateId; name: string; isModified?: boolean; columnWidths?: ColumnWidths | null;
    codeSearchTerms?: string[]; dataSearchTerms?: string[];
    currentSortField?: 'line' | 'code' | 'type' | 'objectCount' | 'dataSize';
    currentSortAscending?: boolean; minLine?: number | null; maxLine?: number | null;
    dataExact?: boolean; dataCase?: boolean; selectedObjectTypes?: string[];
    navigationHistory?: string[]; currentHistoryIndex?: number; classIdToName?: Record<string, string>;
    expandedNodeIds?: StateId[]; originalTreeData?: SourceNode[] | null;
}
export interface UiState { sidebarCollapsed?: boolean; rightPanelHidden?: boolean; sideBySideDiffEnabled?: boolean; }
export interface AppState extends UiState {
    activeTabIdLeft: StateId | null; activeTabIdRight: StateId | null; columnWidths: ColumnWidths | null;
}
export interface RestoredState { app: AppState; leftTabs: SourceTab[]; rightTabs: SourceTab[]; }
export interface StateSnapshot extends RestoredState { version: 1; createdAt: string; }
export interface StateManifest extends AppState { tabIdsLeft: StateId[]; tabIdsRight: StateId[]; timestamp: number; }
/** Strict, throwing JSON codec. All restored data is copied before expansion flags are applied. */
export class StateCodec {
    constructor(limits?: Partial<StateLimits>);
    readonly limits: Readonly<StateLimits>;
    copy<T>(value: T): T;
    stringify(value: unknown): string;
    parse(text: string): unknown;
    getExpandedNodeIds(nodes: SourceNode[]): StateId[];
    restoreExpandedState(nodes: SourceNode[], expandedIds: StateId[]): void;
    serializeTreeData(nodes: SourceNode[]): string;
    serializeTab(tab: SourceTab): SourceTab;
    buildSnapshot(left: SourceTab[], right: SourceTab[], activeLeft: StateId | null, activeRight: StateId | null,
        widths: ColumnWidths | null, ui?: UiState, createdAt?: string): StateSnapshot;
    restoreSnapshot(snapshot: unknown): RestoredState;
    buildManifest(left: SourceTab[], right: SourceTab[], activeLeft: StateId | null, activeRight: StateId | null,
        widths: ColumnWidths | null, ui: UiState, timestamp: number): StateManifest;
    parseManifest(text: string): StateManifest;
    parseTab(text: string, expectedId: StateId): SourceTab;
}
export interface StateStorage {
    readonly length: number; key(index: number): string | null;
    getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void;
}
export interface StateManagerOptions {
    storage?: StateStorage | null; storageKey?: string; tabStatePrefix?: string;
    getUiState?: () => UiState; now?: () => number; maxAge?: number;
    onError?: ((error: unknown, operation: string) => void) | null; limits?: Partial<StateLimits>;
}
export type SaveTabResult = 'saved' | 'metadata-only' | 'preserved' | 'unavailable' | 'failed';
/** Host-injected, best-effort Storage adapter. Multi-key saves are not database transactions. */
export class StateManager {
    constructor(options?: StateManagerOptions);
    readonly codec: StateCodec; readonly disposed: boolean;
    readonly storageKey: string; readonly tabStatePrefix: string;
    buildExportSnapshot(left?: SourceTab[], right?: SourceTab[], activeLeft?: StateId | null, activeRight?: StateId | null,
        widths?: ColumnWidths | null): StateSnapshot;
    restoreFromSnapshot(snapshot: unknown): RestoredState | null;
    serializeTreeData(tree: SourceNode[]): string | null;
    getExpandedNodeIds(tree: SourceNode[]): StateId[];
    restoreExpandedState(tree: SourceNode[], ids: StateId[]): void;
    saveAppState(left?: SourceTab[], right?: SourceTab[], activeLeft?: StateId | null, activeRight?: StateId | null,
        widths?: ColumnWidths | null): boolean;
    saveAppStateLight(left?: SourceTab[], right?: SourceTab[], activeLeft?: StateId | null, activeRight?: StateId | null,
        widths?: ColumnWidths | null): boolean;
    saveTabState(tab: SourceTab): SaveTabResult;
    loadAppState(): StateManifest | null; loadTabState(id: StateId): SourceTab | null;
    removeTabState(id: StateId): boolean; clearAllState(): boolean; hasSavedState(): boolean;
    dispose(): void;
}
