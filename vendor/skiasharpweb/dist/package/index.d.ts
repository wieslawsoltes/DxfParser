import type { RuntimeNamespace } from './runtime.js';
/** Native handles must be disposed. Advanced API members have permissive declarations; see PACKAGING.md. */
export interface NativeObject { readonly IsDisposed: boolean; Dispose(): void; [member: string]: any; }
export interface RuntimeClass { new (...args: any[]): NativeObject; [member: string]: any; }
export type EnumValue = number | string | { readonly value: number };
export type Backend = 'auto' | 'webgpu' | 'webgl' | 'canvas';
export interface FontDescriptor { family?: string; url?: string | URL; data?: Uint8Array | ArrayBuffer; }
export interface InitializationOptions {
  /** Existing initialized CanvasKit. Also enables worker/manual engine integration. */
  CanvasKit?: any;
  /** Defaults to false in the npm entry points. No implicit network font loading. */
  fonts?: false | FontDescriptor[];
  /** Separate SK caches/namespace; Node still shares the engine unless one is injected. */
  isolated?: boolean;
  signal?: AbortSignal;
  /** Browser loader/WASM directory, e.g. /skia/. Copy with skiasharp-web-assets. */
  assetBaseUrl?: string | URL;
  scriptUrl?: string;
  wasmBaseUrl?: string | URL;
}
export interface AssetUrls { readonly scriptUrl: string; readonly wasmUrl: string; readonly wasmBaseUrl: string; }
export interface Point { X: number; Y: number; }
export interface Rect { Left: number; Top: number; Right: number; Bottom: number; readonly Width: number; readonly Height: number; ToArray(): number[]; }
export interface Color { readonly Red: number; readonly Green: number; readonly Blue: number; readonly Alpha: number; WithAlpha(alpha: number): Color; ToUint(): number; }
export interface ImageInfo { Width: number; Height: number; ColorType: EnumValue; AlphaType: EnumValue; readonly BytesPerPixel: number; }
export interface Paint extends NativeObject { Color: Color; IsAntialias: boolean; StrokeWidth: number; Style: EnumValue; BlendMode: EnumValue; Clone(): Paint; }
export interface PaintOptions { Color?: Color; IsAntialias?: boolean; StrokeWidth?: number; Style?: EnumValue; BlendMode?: EnumValue; [member: string]: any; }
export interface Image extends NativeObject { readonly Width: number; readonly Height: number; ReadPixels(...args: any[]): Uint8Array | null; Encode(...args: any[]): Data | null; }
export interface Data extends NativeObject { readonly Size: number; readonly IsEmpty: boolean; readonly Span: Uint8Array; ToArray(): Uint8Array; AsSpan(): Uint8Array; Subset(offset: number | bigint, length: number | bigint): Data; }
export interface Canvas extends NativeObject {
  Clear(color: Color | EnumValue | any): void;
  DrawCircle(x: number, y: number, radius: number, paint: Paint): void;
  DrawRect(rect: Rect, paint: Paint): void;
  DrawRect(x: number, y: number, width: number, height: number, paint: Paint): void;
  DrawPath(path: NativeObject, paint: Paint): void;
  DrawText(text: string, x: number, y: number, font: NativeObject, paint: Paint): void;
  DrawImage(image: Image, ...args: any[]): void;
  Save(): number; Restore(): void; RestoreToCount(count: number): void;
  Translate(x: number, y: number): void; Scale(x: number, y?: number): void;
}
export interface Surface extends NativeObject {
  readonly Canvas: Canvas; readonly Width: number; readonly Height: number;
  readonly Backend: Exclude<Backend, 'auto'>; readonly RenderMode: string;
  readonly Element: HTMLCanvasElement | OffscreenCanvas | null;
  readonly FallbackReasons: readonly string[];
  Flush(): void; FlushAsync(): Promise<void>;
  Snapshot(): Image; SnapshotAsync(): Promise<Image>;
  DisposeAsync(): Promise<void>;
}
export interface SurfaceOptions { backend?: Backend; allowFallback?: boolean; onDeviceLost?: (info: unknown) => void; [member: string]: any; }
export interface SurfaceConstructor extends RuntimeClass {
  Create(info: ImageInfo): Surface;
  Create(element: HTMLCanvasElement | OffscreenCanvas, options?: SurfaceOptions): Promise<Surface>;
}
export interface SkiaSharp extends RuntimeNamespace {
  readonly Version: string; readonly CanvasKit: any;
  readonly BackendCapabilities: Readonly<Record<string, string>>;
  SKSurface: SurfaceConstructor;
  SKPaint: { new (options?: PaintOptions | Paint): Paint; [member: string]: any };
  SKImageInfo: { new (width: number, height: number, colorType?: EnumValue, alphaType?: EnumValue, colorSpace?: NativeObject | null): ImageInfo; [member: string]: any };
  SKColor: { new (r: number, g: number, b: number, a?: number): Color; Parse(value: string): Color; [member: string]: any };
  SKColors: Readonly<Record<string, Color>>;
  SKRect: { new (left: number, top: number, right: number, bottom: number): Rect; Create(width: number, height: number): Rect; Create(x: number, y: number, width: number, height: number): Rect; [member: string]: any };
  SKPoint: { new (x: number, y: number): Point; [member: string]: any };
  SKData: { CreateCopy(bytes: Uint8Array | ArrayBuffer, length?: number | bigint): Data; Create(size: number | bigint): Data; [member: string]: any };
}
export interface PaintSurfaceDetail { Surface: Surface; Canvas: Canvas; Info: ImageInfo; }
export interface SkiaCanvasElement extends HTMLElement {
  readonly Surface: Surface | null;
  readonly Statistics: Readonly<Record<string, number>>;
  InvalidateSurface(): Promise<boolean>;
  RecreateSurface(): Promise<boolean>;
  addEventListener(type: 'paintsurface', listener: (this: SkiaCanvasElement, event: CustomEvent<PaintSurfaceDetail>) => void, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void;
}
export function Initialize(options?: InitializationOptions): Promise<SkiaSharp>;
export function RegisterWebComponent(options?: InitializationOptions): Promise<SkiaSharp>;
export function GetAssetUrls(baseUrl?: string | URL): AssetUrls;
export const Version: string;
export default Initialize;
declare global { interface HTMLElementTagNameMap { 'skia-canvas': SkiaCanvasElement; } }
