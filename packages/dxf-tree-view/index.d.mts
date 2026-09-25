export interface SourceNode { id?: number | string; type?: string; code?: number; properties?: {code: number; value: string}[]; children?: SourceNode[]; [metadata: string]: unknown; }
export interface TreeViewOptions {
    itemHeight?: number; headerRootId?: string; headerElement?: HTMLElement;
    columnWidths?: Record<string, number | string>; minimumColumnWidths?: Record<string, number>;
    onEdit?: (node: SourceNode) => void; onRowSelect?: (node: SourceNode) => void;
    onToggleExpand?: (id: string) => void; onHandleClick?: (handle: string) => void;
    copyCallback?: (node: SourceNode) => void; openCallback?: (node: SourceNode) => void;
    openAndZoomCallback?: (node: SourceNode) => void; openAndZoomPredicate?: (node: SourceNode) => boolean;
    openBlockCallback?: (node: SourceNode) => void; openBlockPredicate?: (node: SourceNode) => boolean;
    hexViewerCallback?: (node: SourceNode) => void;
    getClassNameById?: (id: number) => string | undefined;
    navigateToClassById?: (id: string) => void;
    rowClassProvider?: (index: number, row: unknown) => string | null;
    cellClassProvider?: (index: number, row: unknown, column: string) => string | null;
}
export interface TreeDataGrid {
    readonly container: HTMLElement; readonly content: HTMLElement;
    readonly lifetime: AbortController; treeData: SourceNode[]; flatData: unknown[];
    selectedRowId: string | null; columnWidths: Record<string, number | string>;
    setData(nodes: SourceNode[]): void; refresh(): void; updateVisibleNodes(): void;
    setIndexMap(map: (number | null)[] | null): void; setOverrideTotalRows(count: number | null): void;
    setRowClassProvider(provider: TreeViewOptions['rowClassProvider']): void;
    setCellClassProvider(provider: TreeViewOptions['cellClassProvider']): void;
    syncHeaderWidths(): void; dispose(): void;
}
export interface TreeViewHost {
    window: Window & typeof globalThis;
    isHandleCode: (code: number) => boolean;
    getClassNameById?: TreeViewOptions['getClassNameById'];
    navigateToClassById?: TreeViewOptions['navigateToClassById'];
}
export function createTreeDataGrid(host: TreeViewHost): new (container: HTMLElement, content: HTMLElement, options?: TreeViewOptions) => TreeDataGrid;
