export type RowKey = string | number;
export interface ReportAction<K = RowKey> { label: string; disabled?: boolean; requiresSource?: boolean; run(row: ReportRow<K>): unknown; }
export interface ReportRow<K = RowKey> {
    key: K; values: unknown[]; children?: ReportRow<K>[]; hidden?: boolean;
    source?: HTMLElement; actions?: ReportAction<K>[]; metadata?: unknown;
    related?: () => ReportOptions<K>[]; [metadata: string]: unknown;
}
export interface ReportColumn { title: string; width?: number; [option: string]: unknown; }
export interface ReportOptions<K = RowKey> {
    title?: string; columns?: (string | ReportColumn)[]; rows?: ReportRow<K>[];
    height?: number; showDetails?: boolean; emptyMessage?: string;
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
}
export interface RecordView<K = RowKey> {
    readonly host: HTMLElement; readonly container: HTMLElement; readonly disposed: boolean;
    rows: ReportRow<K>[]; visibleRows: ReportRow<K>[]; selectedKey: K | null;
    selectedRow: ReportRow<K> | null;
    setRows(rows: ReportRow<K>[]): void; setTheme(theme: string): void;
    refresh(): void; dispose(): void;
}
export interface AnalysisView<K = RowKey> extends RecordView<K> {
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
