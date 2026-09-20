import type { InitializationOptions, SkiaSharp, AssetUrls } from './index.js' with { 'resolution-mode': 'import' };
export function Initialize(options?: InitializationOptions): Promise<SkiaSharp>;
export function RegisterWebComponent(options?: InitializationOptions): Promise<SkiaSharp>;
export function GetAssetUrls(baseUrl?: string | URL): AssetUrls;
export const Version: string;
export default Initialize;
