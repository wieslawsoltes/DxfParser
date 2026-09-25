export type SourceId = string | number;
export type Backend = 'auto' | 'webgpu' | 'webgl' | 'canvas';
export interface Point3 { x: number; y: number; z: number; }
export interface ViewState { mode: string; [key: string]: unknown; }
export interface RenderingDocument {
    tabId?: SourceId;
    fileName?: string;
    createdAt?: number;
    sourceLength?: number;
    comparisonSourceText?: string | null;
    sceneGraph: SceneGraph;
    layouts: Map<string, { name: string }>;
    getEntities(layout: string): unknown[];
}
export interface SceneGraph { document: RenderingDocument; }
export interface Placeholder { status: 'placeholder'; fileName?: string; reason?: string; message?: string; }
export interface Frame {
    scene: unknown;
    width: number;
    height: number;
    scale: number;
    worldCenter: Point3;
    viewState: ViewState;
    worldToScreen(point: Point3): { x: number; y: number };
    screenToWorld(point: { x: number; y: number }): Point3;
}
export interface DocumentInput {
    tabId: SourceId;
    fileName?: string;
    sourceText?: string;
    sourceBytes?: Uint8Array | ArrayBuffer;
}
export interface RenderingDataController {
    readonly disposed: boolean;
    readonly documents: Map<SourceId, RenderingDocument | Placeholder>;
    ingestDocument(input?: DocumentInput): RenderingDocument | null;
    registerPlaceholder(id: SourceId, details?: Omit<Placeholder, 'status'>): void;
    getDocument(id: SourceId): RenderingDocument | Placeholder | null;
    getSceneGraph(id: SourceId): SceneGraph | null;
    hasDocument(id: SourceId): boolean;
    releaseDocument(id: SourceId): void;
    subscribe(listener: (event: { type: 'ingest'; document: RenderingDocument }) => void): () => boolean;
    dispose(): void;
}
export interface RenderingDocumentBuilder { build(): RenderingDocument; }
export interface ComparisonSession { enabled: boolean; scene(currentScene: unknown): unknown; }
export interface SurfaceOptions {
    initialize?: () => object | Promise<object>;
    Skia?: object;
    backend?: Backend;
    allowFallback?: boolean;
    maxPixels?: number;
    background?: string;
    lineweights?: boolean;
    [key: string]: unknown;
}
export interface VisualStylePreset { key: string; id: string; name: string; label: string; category: string; }
export interface RenderingSurfaceManager {
    readonly disposed: boolean;
    readonly suspended: boolean;
    readonly activeSurface: object | null;
    readonly resources: object | null | undefined;
    readonly ready: Promise<unknown>;
    readonly lastFrame: Frame | null;
    readonly compiled: unknown;
    readonly sceneGraph: SceneGraph | null;
    readonly diagnostics: readonly unknown[];
    readonly error: Error | null;
    readonly compileRevision: number;
    readonly builtRevision: number;
    readonly selectionHandles: Set<string>;
    readonly blockHighlights: Set<string>;
    readonly layout: string;
    viewState: ViewState;
    viewDirection: Point3;
    gridVisible: boolean;
    onPaint?: ((stats: unknown) => void) | null;
    onError?: ((error: Error) => void) | null;
    canPresent?: (() => boolean) | null;
    initialize(canvas: HTMLCanvasElement): this;
    subscribeFrame(listener: (frame: Frame) => void): () => boolean;
    setCanvasReplacementCallback(listener: (canvas: HTMLCanvasElement) => void): void;
    setLayerState(value: Map<string, unknown> | Record<string, unknown>): void;
    setBlockIsolation(value: Iterable<string> | null): void;
    setEntityIsolation(value: Iterable<string> | null): void;
    setBlockHighlights(value: Iterable<string> | null): void;
    setSelectionHandles(value: Iterable<string> | null): void;
    setAttributeDisplay(value: { showDefinitions?: boolean; showReferences?: boolean; showInvisible?: boolean }): void;
    setVisualStyle(value: string | Partial<VisualStylePreset> | null): void;
    getVisualStyleOverride(): { value: string };
    setLayout(layout: string): Frame;
    setViewDirection(direction: Point3): Frame | null;
    setComparison(session: ComparisonSession | null): void;
    renderScene(sceneGraph: SceneGraph, options?: { viewState?: ViewState }): Frame;
    resize(width: number, height: number, dpr?: number): void;
    resume(): void;
    suspend(): void;
    clear(): void;
    renderMessage(message: unknown): void;
    registerResource(name: string, bytes: Uint8Array | ArrayBuffer, options?: Record<string, unknown>): Promise<unknown>;
    exportPng(): Promise<Uint8Array>;
    exportPdf(options?: Record<string, unknown>): Promise<Uint8Array>;
    dispose(): Promise<void>;
    destroy(): Promise<void>;
}
export interface RenderingServices {
    RenderingDataController: new (options?: Record<string, unknown>) => RenderingDataController;
    RenderingDocumentBuilder: new (options?: { tags?: unknown }) => RenderingDocumentBuilder;
    RenderingSurfaceManager: {
        new (options?: SurfaceOptions): RenderingSurfaceManager;
        getVisualStylePresets(): VisualStylePreset[];
    };
}
export function createRenderingServices(options: {
    renderer: object;
    initialize?: () => object | Promise<object>;
    onObserverError?: (error: unknown) => void;
}): Readonly<RenderingServices>;

export interface Property { name?: unknown; value?: unknown; isHtml?: boolean; }
export interface PropertySection { title?: string; subtitle?: string; properties?: readonly Property[]; }
export interface PropertyRow { key: string; values: unknown[]; }
export interface RecordView {
    setRows(rows: PropertyRow[]): void;
    setTheme?(theme: string): void;
    dispose(): void;
}
export interface PropertyInspector {
    readonly container: HTMLElement | null;
    readonly disposed: boolean;
    readonly sections: readonly PropertySection[];
    readonly gridView?: RecordView | null;
    setSections(sections: readonly PropertySection[] | null): void;
    clear(): void;
    render(): void;
    setTheme(theme: string): void;
    dispose(): void;
}
export function createPropertyInspector(options: {
    window: Window & typeof globalThis;
    createRecordView?: (container: HTMLElement, options: { title: string; columns: string[]; rows: PropertyRow[] }) => RecordView;
}): new (container: HTMLElement, options?: { title?: string; emptyMessage?: string }) => PropertyInspector;
