// Application compatibility boundary; the package itself never installs globals.
import * as inspector from '../packages/dxf-inspector/index.mjs';
Object.assign(globalThis, inspector);
