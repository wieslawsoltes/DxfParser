export type FileBytes = Uint8Array | ArrayBuffer;
export interface ArchiveRow {
  key: string;
  values: [string, 'Folder' | 'File', number];
  actions: { label: string; run(): unknown }[];
}
export interface ArchiveViewOptions {
  title: string;
  columns: (string | { title: string; width: number })[];
  rows: ArchiveRow[];
}
export interface ArchiveView {
  dispose(): void;
  setTheme(theme: string): void;
}
export interface OfficePreviewOptions {
  id?: string;
  /** Optional request to reveal this control. Panel selection belongs to the host. */
  onReveal?(preview: OfficePreview): void;
}
export interface OfficePreview {
  readonly node: HTMLElement;
  readonly toolbar: HTMLElement;
  readonly stage: HTMLElement;
  readonly tabs: HTMLElement;
  readonly status: HTMLElement;
  readonly fileInput: HTMLInputElement;
  readonly download: HTMLButtonElement;
  readonly zoom: HTMLSelectElement;
  readonly disposed: boolean;
  readonly original: Uint8Array | null;
  readonly filename: string | undefined;
  openFile(file: Pick<File, 'arrayBuffer' | 'size' | 'name'>): Promise<boolean>;
  open(input: FileBytes, name?: string, options?: { embedded?: boolean }): Promise<boolean>;
  browseArchive(input: FileBytes, container: HTMLElement, entries?: Map<string, Uint8Array>): Promise<boolean | undefined>;
  cancelPending(): void;
  setTheme(theme: string): void;
  saveBytes(bytes: FileBytes, name: string): void;
  downloadOriginal(): void;
  clear(): void;
  dispose(): void;
}
export interface DecoderHost { excel?: object; gridWeb?: object; richTextWeb?: object }
export interface DocumentModel { ToJSON(): unknown }
export function createOfficePreview(host: DecoderHost & {
  window: Window & typeof globalThis;
  createArchiveView?(container: HTMLElement, options: ArchiveViewOptions): ArchiveView;
}): new (options?: OfficePreviewOptions) => OfficePreview;
export function createOfficeDecoders(host?: DecoderHost): {
  legacyWord(bytes: Uint8Array): string;
  legacyWorkbook(bytes: Uint8Array, name: string): { workbook: object; warnings: string[] };
  safeDocument(model: DocumentModel): DocumentModel;
};
export function bytesOf(input: FileBytes): Uint8Array;
export const MAX_INPUT: number;
export const MAX_CELLS: number;
