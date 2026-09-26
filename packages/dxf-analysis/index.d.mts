export type RowKey = string | number;
export interface ReportAction<K = RowKey> { label: string; disabled?: boolean; requiresSource?: boolean; run(row: ReportRow<K>): unknown; }
export interface ReportRow<K = RowKey> {
    key: K; values: unknown[]; children?: ReportRow<K>[]; hidden?: boolean;
    source?: HTMLElement; actions?: ReportAction<K>[]; metadata?: unknown;
    related?: () => ReportOptions<K>[]; [metadata: string]: unknown;
}
export interface ReportColumn { title: string; width?: number | string; minWidth?: number; [option: string]: unknown; }
export interface ReportOptions<K = RowKey> {
    title?: string; columns?: (string | ReportColumn)[]; rows?: ReportRow<K>[];
    height?: number; showDetails?: boolean; docking?: false; emptyMessage?: string;
    visualization?: false | Record<string, unknown>;
    onSelect?: (row: ReportRow<K> | null) => void;
    onFilterChange?: () => void;
}
export interface Bucket<K = RowKey> { key: string; label: string; value: number; count: number; keys: K[]; other?: boolean; lo?: number; hi?: number; }
export function label(value: unknown): string;
export function numeric(value: unknown): value is number;
export function aggregate<K>(rows: ReportRow<K>[], group: number, measure?: number): { buckets: Bucket<K>[]; excluded: number };
export function top<K>(buckets: Bucket<K>[], limit?: number): Bucket<K>[];
export function histogram<K>(rows: ReportRow<K>[], column: number, count?: number): { buckets: Bucket<K>[]; excluded: number };
export function matrix<K>(rows: ReportRow<K>[], x: number, y: number, maxX?: number, maxY?: number): { xs: Bucket<K>[]; ys: Bucket<K>[]; cells: { keys: K[]; value: number }[][] };
export function byteStats<K>(rows: ReportRow<K>[], column: number): { total: number; entropy: number; printable: number; invalid: number; counts: Uint32Array; buckets: Bucket<K>[] };
export function compareRows<K>(columns: ReportColumn[], baseline: ReportRow<K>, selected: ReportRow<K>): ReportRow<string>[];
/** The host registers vendor custom elements in this window before constructing views. */
export interface AnalysisHost {
    window: Window & typeof globalThis;
    gridWeb?: object;
    treeDataGridCore: object;
    treeDataGridWeb: object;
    /** Activate/validate a source ID before a source-bound action; throw to reject a closed source. */
    activateSource?: (sourceId: string) => void;
    createLayout?: (options: AnalysisLayoutOptions) => AnalysisLayout;
    onExpand?: (view: AnalysisView) => unknown;
}
export interface RecordView<K = RowKey> {
    readonly host: HTMLElement; readonly container: HTMLElement; readonly disposed: boolean;
    rows: ReportRow<K>[]; visibleRows: ReportRow<K>[]; selectedKey: K | null;
    selectedRow: ReportRow<K> | null;
    setRows(rows: ReportRow<K>[]): void; setTheme(theme: string): void;
    refresh(): void; dispose(): void;
}
export interface AnalysisView<K = RowKey> extends RecordView<K> {
    readonly docking?: AnalysisLayout;
    toggleDetails(value?: boolean): void;
    refreshLayout(): void;
    readonly search: HTMLInputElement; readonly sort: HTMLSelectElement;
    setMode(mode: 'records' | 'spreadsheet'): void; selectKey(key: K): void;
    setVisualFilter(filter: { label: string; keys: Iterable<K> } | null): void;
    revealKey(key: K): void; clearFilters(): void;
    csvText(): string; selectionText(): string; exportCsv(): void;
    saveState(): object; restoreState(state: object): void;
    runAction(run: () => unknown, requiresSource?: boolean): Promise<boolean | undefined>;
}
export interface ReportDescriptor<K = RowKey> {
    selector: string; title?: string; columns?: (string | ReportColumn)[];
    records(source: HTMLElement): ReportRow<K>[];
}
export interface ReportRegistry {
    removeRoots(roots: HTMLElement[]): void; setTheme(theme: string): void; dispose(): void;
}
export interface AnalysisUI {
    GridView: new <K = RowKey>(container: HTMLElement, options?: ReportOptions<K>) => RecordView<K>;
    AnalysisView: new <K = RowKey>(container: HTMLElement, options?: ReportOptions<K>) => AnalysisView<K>;
    ReportRegistry: new (roots: HTMLElement[], descriptors?: ReportDescriptor[]) => ReportRegistry;
    AnalysisVisuals: new (view: AnalysisView, profile?: object) => { dispose(): void; schedule(): void };
    flatten<K>(rows: ReportRow<K>[]): ReportRow<K>[];
    element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: unknown): HTMLElementTagNameMap[K];
    scalar(value: unknown): unknown; text(node?: Node | null): string;
    directText(node: Node): string; keyFor(node: HTMLElement): string;
    valueOf(cell: HTMLElement): unknown;
    listRecords(node: HTMLElement): ReportRow[];
    sourceControls(source?: HTMLElement): HTMLElement[];
    labelOf(control: HTMLElement): string;
}
export function createAnalysisUI(host: AnalysisHost): Readonly<AnalysisUI>;

export type AnalysisPreset = 'auto' | 'balanced' | 'stacked' | 'tabs';
export type AnalysisPane = 'records' | 'visual' | 'details';
export function analysisArrangement(width: number, height: number, preset?: AnalysisPreset): Exclude<AnalysisPreset, 'auto'>;
export interface AnalysisLayoutOptions {
    container: HTMLElement; records: HTMLElement; details: HTMLElement; visual?: HTMLElement;
    title?: string; onChange?: () => void; onResize?: (pane: AnalysisPane) => void;
    storage?: Pick<Storage, 'getItem' | 'setItem'> | null; storageKey?: string | null;
}
export interface AnalysisLayout {
    readonly host: HTMLElement; readonly container: HTMLElement; readonly disposed: boolean;
    readonly focused: AnalysisPane | null;
    isOpen(pane: AnalysisPane): boolean; isVisible(pane: AnalysisPane): boolean;
    visualMode(): 'data' | 'split' | 'visual';
    show(pane: AnalysisPane): void; hide(pane: Exclude<AnalysisPane, 'records'>): void;
    focus(pane: AnalysisPane): void; restoreFocus(): void; setPreset(preset: AnalysisPreset): void;
    reset(): void; schedule(): void; saveState(): object | null; restoreState(state: object): void;
    setTheme(theme: string): void; dispose(): void;
}
export function createAnalysisDocking(host: { window: Window & typeof globalThis; dockyard: object }): new (options: AnalysisLayoutOptions) => AnalysisLayout;

/** A bounded record sink with host-supplied asynchronous scheduling. */
export class ReportBuffer<T = ReportRow> {
    constructor(options: {
        publish: (rows: T[]) => void;
        schedule: (callback: () => void) => unknown;
        cancel: (token: unknown) => void;
        onError?: (error: unknown) => void;
        maxRows?: number;
    });
    readonly count: number; readonly disposed: boolean;
    snapshot(): T[]; append(row: T): number; appendMany(rows: T[]): number;
    replace(rows: T[]): void; flush(): void; dispose(): void;
}
export type ResultLayout = 'tabs' | 'horizontal' | 'vertical';
export function reportWorkspaceArrangement(width: number, height: number, mode?: ResultLayout): {
    compact: boolean; mode: ResultLayout;
};
export interface ResultDocument<K = RowKey> {
    readonly id: string; readonly title: string; readonly content: HTMLElement;
    readonly view: RecordView<K> & { refreshLayout?(): void };
    readonly buffer: ReportBuffer<ReportRow<K>>; readonly disposed: boolean;
}
export interface ReportWorkspaceOptions<K = RowKey> {
    container: HTMLElement; controls?: HTMLElement | null; controlsTitle?: string; title?: string;
    maxDocuments?: number; maxRows?: number;
    onClose?: (entry: ResultDocument<K>) => void;
    onActiveChange?: (entry: ResultDocument<K> | null) => void;
    onError?: (error: unknown) => void;
}
export interface ReportWorkspace<K = RowKey> {
    readonly root: HTMLElement; readonly host: HTMLElement; readonly container: HTMLElement;
    readonly disposed: boolean; readonly activeId: string | null;
    readonly entries: ReadonlyMap<string, ResultDocument<K>>;
    add(options?: ReportOptions<K> & { id?: string }): ResultDocument<K>;
    append(id: string, row: ReportRow<K>): number;
    appendMany(id: string, rows: ReportRow<K>[]): number;
    flush(id: string): void; activate(id: string): void; remove(id: string): boolean;
    arrange(mode: ResultLayout): void; showControls(): void; focusResults(): void;
    refreshLayout(): void; setTheme(theme: string): void; dispose(): void;
}
export function createReportWorkspace<K = RowKey>(host: {
    window: Window & typeof globalThis; dockyard: object;
    createView(container: HTMLElement, options: ReportOptions<K>): RecordView<K> & { refreshLayout?(): void };
}): new (options: ReportWorkspaceOptions<K>) => ReportWorkspace<K>;
