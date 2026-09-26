/** A raw DXF group pair with its source line. */
export interface DxfTag { code: number; value: string; line: number; }
export interface DxfNode {
    id: number; type: string; line: number; endLine?: number;
    properties: DxfTag[]; children: DxfNode[]; handle?: string;
    expanded?: boolean; parentId?: number; [metadata: string]: unknown;
}
export interface GroupResult { objects: DxfNode[]; nextIndex: number; endLine?: number; }
export class DxfParser {
    nextId: number;
    containerMapping: Record<string, string>;
    parse(text: string): DxfNode[];
    parseDxf(text: string): DxfTag[];
    parseDxfLines(lines: string[]): DxfTag[];
    groupObjects(tags: DxfTag[], startIndex: number, endMarker?: string | null, containerStartLine?: number | null): GroupResult;
    groupObjectsIterative(tags: DxfTag[], startIndex?: number, endMarker?: string | null, containerStartLine?: number | null): GroupResult;
    findNodeById(tree: DxfNode[], id: number): DxfNode | null;
    findNodeByIdIterative(tree: DxfNode[], id: number): DxfNode | null;
    findParentByIdIterative(tree: DxfNode[], id: number): DxfNode | null;
    serializeNode(node: DxfNode): string;
    serializeTree(nodes: DxfNode[]): string;
}
export interface DiffOptions { ignoreHandles?: boolean; respectExpanded?: boolean; }
export interface AlignedRow { leftIndex: number | null; rightIndex: number | null; }
export type ColumnKey = 'line' | 'code' | 'type' | 'objectCount' | 'dataSize';
export interface TreeDiff {
    aligned: AlignedRow[]; totalRows: number;
    leftRowClasses: Map<number, string>; rightRowClasses: Map<number, string>;
    leftCellClasses: Map<number, Partial<Record<ColumnKey, string>>>;
    rightCellClasses: Map<number, Partial<Record<ColumnKey, string>>>;
}
export interface FlatRow { key: string; value: string; node: DxfNode | { isProperty: true; code: number; data: string }; level: number; }
export class TreeDiffEngine {
    static computeDiff(left: DxfNode[], right: DxfNode[], options?: DiffOptions): TreeDiff;
    static flattenTreeWithKeys(tree: DxfNode[], options?: DiffOptions): FlatRow[];
    static getNodeSemanticId(node: DxfNode, options?: DiffOptions): string;
    static alignByKeysLCS(left: string[], right: string[]): AlignedRow[];
    static alignByKeysSmart(left: string[], right: string[]): AlignedRow[];
}
export type DiagnosticCategory = 'structural' | 'integrity' | 'rendering' | 'text' | 'performance' | 'compliance' | 'bestPractices' | 'security';
export interface DiagnosticIssue {
    severity: 'critical' | 'error' | 'warning' | 'info' | 'suggestion';
    title: string; description: string; category?: string; location?: string;
    actions?: { type: string; data?: unknown; label: string }[];
    [metadata: string]: unknown;
}
export interface DiagnosticStatistics {
    totalIssues: number; criticalIssues: number; errorIssues: number;
    warningIssues: number; infoIssues: number; suggestions: number;
}
export type DiagnosticResult = Record<DiagnosticCategory, DiagnosticIssue[]> & { stats: DiagnosticStatistics };
export type RuleConfiguration = Partial<Record<DiagnosticCategory, Record<string, boolean>>>;
/** Create a new engine for each diagnostic run. Results are inspection heuristics, not CAD certification. */
export class DXFDiagnosticsEngine {
    constructor(tree: DxfNode[], fileName: string, rules?: RuleConfiguration | null);
    readonly dxfTree: DxfNode[]; readonly fileName: string;
    issues: Record<DiagnosticCategory, DiagnosticIssue[]>; stats: DiagnosticStatistics;
    runFullDiagnostics(progress?: (percent: number, step: string) => void): Promise<DiagnosticResult>;
    isRuleEnabled(category: DiagnosticCategory, ruleId: string): boolean;
    traverseTree(nodes: DxfNode[], visit: (node: DxfNode, path: number[]) => void, path?: number[]): void;
}
export function hexStringToByteArray(hex: string): Uint8Array;
export function hexDump(bytes: Uint8Array): string;
export function detectHeader(bytes: Uint8Array): string | null;
export function isHandleCode(code: number): boolean;

export interface InspectionSource { id?: string | number; originalTreeData?: DxfNode[]; [metadata: string]: unknown; }
export interface InspectionReference { node: DxfNode | null; label: string; value?: string; }
export interface InspectionIndex<T extends InspectionSource = InspectionSource> {
    tab: T | null | undefined; nodes: DxfNode[];
    types: Map<string, DxfNode[]>; codes: Map<number, { node: DxfNode; property: DxfTag }[]>;
    handles: Map<string, DxfNode[]>; incoming: Map<string, { node: DxfNode; property: DxfTag }[]>;
    size: Map<DxfNode, number>; positions: Map<DxfNode, number>;
    depth: number; properties: number; characters: number;
    references?: { incoming: Map<DxfNode, InspectionReference[]>; outgoing: Map<DxfNode, InspectionReference[]> };
}
export function inspectTree<T extends InspectionSource>(source?: T | null): InspectionIndex<T>;
export function referenceIndex(index: InspectionIndex): NonNullable<InspectionIndex['references']>;
/** Bounded MTEXT text preview, not CAD typesetting. Source values remain unchanged. */
export function mtextPlain(raw: unknown): string;

/** Synchronous query budgets. Zero is valid for an empty source/result. */
export interface SourceQueryLimits { maxNodes?: number; maxProperties?: number; maxDepth?: number; }
export const DEFAULT_QUERY_LIMITS: Readonly<Required<SourceQueryLimits>>;
export interface SourceQueryOptions { limits?: SourceQueryLimits; signal?: AbortSignal; }
export interface SourceFilterOptions extends SourceQueryOptions {
    codeTerms?: readonly (string | number)[]; dataTerms?: readonly string[];
    dataExact?: boolean; dataCase?: boolean; minLine?: number | null; maxLine?: number | null;
    objectTypes?: readonly string[];
    /** Projection-to-canonical ownership. Properties retain their source identity. */
    sourceMap?: WeakMap<DxfNode, DxfNode>;
}
export interface SourceSearchOptions extends SourceQueryOptions {
    objectType?: string; searchText?: string; searchCode?: string | number;
    exact?: boolean; dataCase?: boolean; maxResults?: number;
}
export interface SourceSearchMatch {
    node: DxfNode; property: DxfTag | null; line: number; data: string;
}
/** New node/array projections retaining the existing workbench filter semantics. */
export function filterSourceTree(nodes: DxfNode[], options?: SourceFilterOptions): DxfNode[];
/** Original source node/property references, ordered in preorder; never truncated. */
export function searchSourceTree(nodes: DxfNode[], options?: SourceSearchOptions): SourceSearchMatch[];
/** A host-owned synchronous predicate; strings are never compiled or evaluated. */
export function selectSourceNodes(nodes: DxfNode[], predicate: (node: DxfNode) => boolean,
    options?: SourceQueryOptions & { maxResults?: number }): DxfNode[];
export function sourceSortValue(node: DxfNode, field: ColumnKey, options?: SourceQueryOptions): string | number;
/** In-place stable ordering. Preflight rejects invalid graphs/budgets/non-writable arrays before writes. */
export function sortSourceTree(nodes: DxfNode[], field: ColumnKey, ascending?: boolean,
    options?: SourceQueryOptions): DxfNode[];
/** In-place expansion with preflight validation; expanding leaves without content is a no-op. */
export function setSourceExpansion(nodes: DxfNode[], expanded: boolean, options?: SourceQueryOptions): DxfNode[];
