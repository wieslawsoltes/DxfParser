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
