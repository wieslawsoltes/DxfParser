export interface Point { x: number; y: number; z: number; }
export type LinkMode = 'off' | 'world' | 'relative';
export type TileMode = 'horizontal' | 'vertical' | 'grid';
export interface CameraFrame {
    scene: { layout?: string; [property: string]: unknown }; basis: { z: Point };
    worldCenter: Point; scale: number; rotationRad: number; width: number; height: number;
}
export interface CameraSnapshot {
    layout: string; direction: Point; center: Point; scale: number;
    rotationRad: number; offset: Point; zoom: number;
}
export interface CameraTransfer { direction: Point; viewState: { mode: 'custom'; center: Point; scale: number; rotationRad: number }; }
export interface NavigationRecord { open: boolean; disposed?: boolean; }
export interface NavigationHost<R extends NavigationRecord, Ticket = unknown> {
    active(): R | null; records(): Iterable<R>; visible(record: R): boolean;
    frame(record: R): CameraFrame | null; layout(record: R): string;
    apply(record: R, camera: CameraTransfer, history: boolean): void;
    schedule(run: () => void): Ticket; cancel(ticket: Ticket): void;
    changed?(): void; error?(error: unknown): void;
}
export interface NavigationLink<R extends NavigationRecord> {
    readonly mode: LinkMode; readonly snapshot: CameraSnapshot | null;
    setMode(mode: LinkMode): void; onFrame(record: R, frame: CameraFrame): void;
    apply(record: R, snapshot?: CameraSnapshot | null, mode?: LinkMode, history?: boolean): void;
    focus(record: R): void; flush(): void;
    match(): void; reset(): void; dispose(): void;
}
export interface DrawingViewTools {
    captureCamera(frame: CameraFrame, layout?: string): CameraSnapshot;
    transferCamera(snapshot: CameraSnapshot, target: CameraFrame, mode?: Exclude<LinkMode, 'off'>, layout?: string): CameraTransfer | null;
    sameCamera(frame: CameraFrame, camera: CameraTransfer): boolean;
    NavigationLink: new <R extends NavigationRecord, Ticket>(host: NavigationHost<R, Ticket>) => NavigationLink<R>;
    gridShape(count: number, width?: number, height?: number): {columns: number; rows: number};
    tileDrawings(manager: object, documents: object[], mode?: TileMode, width?: number, height?: number): {columns: number; rows: number} | undefined;
}
/** Inject the same renderer and Dockyard API instances as the surrounding host. */
export function createDrawingViewTools(renderer: object, dockyard: object): Readonly<DrawingViewTools>;
