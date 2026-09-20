/** Native surfaces and font/image objects come from the host's SkiaSharpWeb
 * namespace. Importing this package performs no I/O and bundles no fonts. */
export interface Point { x: number; y: number; z: number; }
export interface Bounds { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number; }
export type Matrix = number[];
export type PathCommand = ['M' | 'L', Point] | ['K', Point, Point, number] | ['Q', Point, Point] | ['C', Point, Point, Point] | ['Z'];
export interface Tag { code: number; value: string; line?: number; }
export interface Diagnostic { code: string; message: string; severity: 'error' | 'warning' | 'info'; handle?: string | null; type?: string | null; }
export interface Style { color: string; layer: string; alpha: number; lineweight: number; dash?: number[]; dashScale?: number; }
export interface Clip { points?: Point[]; loops?: Point[][]; path?: PathCommand[]; inverse: boolean; }
export interface Primitive {
  kind: 'path' | 'text' | 'image' | 'point'; handle?: string; type?: string;
  path?: PathCommand[]; points: Point[]; rings?: Point[][]; bounds: Bounds;
  style: Style; clips: Clip[]; closed?: boolean; fill?: boolean; fillRule?: string;
  text?: string; font?: string; fontName?: string; position?: Point; u?: Point; v?: Point;
  align?: number; vertical?: number; attachment?: number; wrapWidth?: number; lineSpacing?: number;
  mtext?: boolean; infinite?: 'line' | 'ray';
  [metadata: string]: unknown;
}
export interface CompileOptions {
  tolerance?: number; maxPrimitives?: number; maxVertices?: number; maxDepth?: number;
  maxInstances?: number; maxPatternLines?: number; maxDiagnostics?: number; lineweights?: boolean; background?: string; printing?: boolean;
  showDefinitions?: boolean; showReferences?: boolean; showInvisible?: boolean;
  layerState?: Record<string, { isOn?: boolean; isFrozen?: boolean; [property: string]: unknown }>;
  blockIsolation?: Set<string>; entityIsolation?: Set<string>;
  textMeasurer?: (primitive: Partial<Primitive>, text: string) => number;
  plugins?: Iterable<readonly [string, (record: DxfRecord, context: {document: DxfDocument; context: Record<string, unknown>; style: Style; geometry: Geometry}) => Array<Partial<Primitive>>]>;
}
export interface Scene { document: DxfDocument; layout: string; primitives: Primitive[]; diagnostics: Diagnostic[]; bounds: Bounds; compileOptions: CompileOptions; }
export interface ViewState { mode?: 'auto' | 'custom'; center?: Point; scale?: number; rotationRad?: number; }
export interface FrameOptions { width?: number; height?: number; devicePixelRatio?: number; viewState?: ViewState; viewDirection?: Point; padding?: number; visualStyle?: '2dwireframe' | 'shaded'; background?: string; }
export interface Pickable { primitive: Primitive; handle: string; type: string; worldPoints: Point[]; screenPoints: Point[]; worldBounds: Bounds; screenBounds: Bounds; [property: string]: unknown; }
export interface Frame {
  scene: Scene; width: number; height: number; devicePixelRatio: number; scale: number;
  worldCenter: Point; rotationRad: number; bounds: Bounds; basis: { x: Point; y: Point; z: Point };
  pickables: Pickable[]; worldToScreen(point: Point): Point; screenToWorld(point: Pick<Point, 'x' | 'y'>): Point;
  [property: string]: unknown;
}
export interface PaintOptions { selection?: Set<string>; blockHighlights?: Set<string>; grid?: boolean; background?: string; }
export interface PaintStatistics { drawn: number; diagnostics: Diagnostic[]; backend?: string; frame?: Frame; paintCount?: number; [property: string]: unknown; }
export interface ResourceEntry { name: string; key: string; kind: 'font' | 'image' | 'shape'; size: number; native: unknown; shape: ShapeFont | null; }
export class DxfRecord {
  constructor(tags: Tag[], index?: number); readonly type: string; readonly handle: string; readonly id: string;
  readonly tags: Tag[]; readonly extrusion: Point;
  all(code: number): string[]; get(code: number, fallback?: string | null): string | null;
  num(code: number, fallback?: number): number; point(code: number, fallback?: Point): Point; points(code: number): Point[];
}
export class DxfDocument {
  constructor(input: string | Tag[], options?: { maxTags?: number; maxBytes?: number; maxDiagnostics?: number });
  records: DxfRecord[]; entities: DxfRecord[]; blocks: DxfRecord[]; blockDefinitions: Map<string, unknown>; objects: DxfRecord[];
  byHandle: Map<string, DxfRecord>; layouts: Map<string, { name: string; [field: string]: unknown }>;
  diagnostics: Diagnostics; tables: Record<string, Record<string, unknown>>; sceneGraph: Record<string, unknown>;
  fileName?: string; tabId?: string; getEntities(layout?: string): DxfRecord[];
}
export class Diagnostics { constructor(limit?: number); items: Diagnostic[]; add(code: string, message: string, entity?: DxfRecord, severity?: Diagnostic['severity']): void; }
export class SceneCompiler { constructor(document: DxfDocument, options?: CompileOptions); compile(layout?: string): Scene; }
export class SpatialIndex<T extends { bounds: Bounds }> { constructor(items: T[], leafSize?: number); search(bounds: Bounds): T[]; }
export class ShapeFont { static parse(bytes: Uint8Array): ShapeFont; name: string; above: number; below: number; glyph(code: number, options?: { vertical?: boolean; maxOperations?: number; maxDepth?: number }): { path: PathCommand[]; advance: number; above: number } | null; }
export class ResourceStore {
  constructor(skia: unknown, options?: { maxBytes?: number; maxImagePixels?: number });
  readonly bytes: number; readonly revision: number; readonly entries: Map<string, ResourceEntry>;
  register(name: string, bytes: Uint8Array | ArrayBuffer, options?: {kind?: ResourceEntry['kind']}): ResourceEntry;
  get(name: string, kind?: ResourceEntry['kind']): ResourceEntry | undefined;
  remove(name: string): boolean; measureText(primitive: Partial<Primitive>, text: string): number;
  createFont(entry: ResourceEntry): unknown; dispose(): void;
}
export class SkiaPainter {
  constructor(skia: unknown, options?: { resources?: ResourceStore; cacheLimit?: number });
  readonly resources: ResourceStore; draw(nativeCanvas: unknown, frame: Frame, options?: PaintOptions): PaintStatistics;
  clearCache(): void; dispose(): void;
}
export class SurfaceHost {
  constructor(options: {initialize?: () => Promise<unknown>; Skia?: unknown; backend?: 'auto' | 'webgpu' | 'webgl' | 'canvas'; resources?: ResourceStore; maxPixels?: number; onPaint?: (statistics: PaintStatistics) => void; onError?: (error: Error) => void; onCanvasReplaced?: (canvas: HTMLCanvasElement, previous: HTMLCanvasElement) => void });
  resources: ResourceStore | null; readonly disposed: boolean; readonly paintCount: number;
  lastFrame: Frame | null; initialize(canvas: HTMLCanvasElement): this; ensureRuntime(): Promise<unknown>;
  request(frame: Frame, options?: PaintOptions): void; whenIdle(): Promise<Frame | null>;
  suspend(): void; resume(): void; registerResource(name: string, bytes: Uint8Array | ArrayBuffer, options?: {kind?: ResourceEntry['kind']}): Promise<ResourceEntry>;
  exportPng(): Promise<Uint8Array>; exportPdf(options?: { width?: number; height?: number; background?: string }): Promise<Uint8Array>;
  dispose(): Promise<void>;
}
export function parseTags(text: string, options?: { maxTags?: number; maxBytes?: number; maxDiagnostics?: number }): Tag[];
export function prepareFrame(scene: Scene, options?: FrameOptions): Frame;
export function hitTest(frame: Frame, point: Pick<Point, 'x' | 'y'>, tolerance?: number): Pickable | null;
export function snap(frame: Frame, point: Pick<Point, 'x' | 'y'>, tolerance?: number): {type: string; point: Point; handle?: string; [field: string]: unknown} | null;
export function resourceKey(name: string): string;
export function aciColor(index: number, background?: string): string;
export function transparency(value: number | null, inherited?: number, layer?: number): number;
export function plainText(raw: string): string;
export function fallbackTextWidth(text: string): number;
export function nativeDash(pattern: number[], scale?: number, dotLength?: number): { intervals: number[]; phase: number; empty?: boolean };
export function clipInfiniteLine(a: Point, b: Point, bounds: Bounds, ray?: boolean): [Point, Point] | null;
export function draftingGlyph(character: string): { path: PathCommand[]; advance: number };
export interface Geometry {
  readonly TAU: number; readonly EPS: number;
  vec(x?: number,y?: number,z?: number): Point;
  add(a: Point,b: Point): Point; sub(a: Point,b: Point): Point; mul(a: Point,scale: number): Point;
  dot(a: Point,b: Point): number; cross(a: Point,b: Point): Point; length(a: Point): number;
  normal(a: Point): Point; distance(a: Point,b: Point): number; lerp(a: Point,b: Point,t: number): Point;
  identity(): Matrix; multiply(a: Matrix,b: Matrix): Matrix; inverse(matrix: Matrix): Matrix;
  translation(point: Point): Matrix; scaling(x: number,y: number,z?: number): Matrix;
  rotation(angle: number): Matrix; transform(matrix: Matrix,point: Point): Point; direction(matrix: Matrix,point: Point): Point;
  ocs(normal: Point): Matrix; bounds(points: Point[]): Bounds; emptyBounds(): Bounds;
  isEmpty(bounds: Bounds): boolean; union(a: Bounds,b: Bounds): Bounds; intersects(a: Bounds,b: Bounds): boolean;
  arcPath(center: Point,u: Point,v: Point,start: number,sweep: number): PathCommand[];
  bulgePath(a: Point,b: Point,bulge: number): PathCommand[];
  pathFromPoints(points: Point[],closed?: boolean): PathCommand[];
  transformPath(path: PathCommand[],matrix: Matrix): PathCommand[];
  flatten(path: PathCommand[],tolerance?: number,maxPoints?: number): {points: Point[]; rings: Point[][]; truncated: boolean};
  evaluateNurbs(points: Point[],degree: number,knots: number[],weights: number[],t: number): Point;
  sampleNurbs(points: Point[],degree: number,knots: number[],weights: number[],tolerance?: number): Point[];
}
export const geometry: Readonly<Geometry>;
export function colorObject(value: number): {red: number; green: number; blue: number; r: number; g: number; b: number};
export function layoutText(primitive: Partial<Primitive>, measure?: (text: string) => number): {lines: Array<{text: string; x: number; y: number; width: number}>; [field: string]: unknown};
export function projectedScene(scene: Scene, basis: Frame['basis']): unknown;
export function decodeProxy(compiler: SceneCompiler, entity: DxfRecord, context: Record<string, unknown>, style: Style): void;
declare const api: {
  geometry: typeof geometry; SpatialIndex: typeof SpatialIndex; DxfDocument: typeof DxfDocument;
  DxfRecord: typeof DxfRecord; Diagnostics: typeof Diagnostics; SceneCompiler: typeof SceneCompiler;
  SkiaPainter: typeof SkiaPainter; SurfaceHost: typeof SurfaceHost; ResourceStore: typeof ResourceStore;
  ShapeFont: typeof ShapeFont; parseTags: typeof parseTags; prepareFrame: typeof prepareFrame;
  hitTest: typeof hitTest; snap: typeof snap; resourceKey: typeof resourceKey; aciColor: typeof aciColor;
  plainText: typeof plainText; draftingGlyph: typeof draftingGlyph; layoutText: typeof layoutText;
  nativeDash: typeof nativeDash; clipInfiniteLine: typeof clipInfiniteLine;
};
export default api;
