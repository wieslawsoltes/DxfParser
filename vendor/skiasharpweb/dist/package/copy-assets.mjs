#!/usr/bin/env node
import { copyFile, mkdir, readFile, lstat, realpath } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const files = ['canvaskit.js', 'canvaskit.wasm', 'native-build-manifest.json', 'LICENSE-canvaskit', 'THIRD_PARTY_NOTICES.txt'];
const sourceFile = (source, name) => name === 'THIRD_PARTY_NOTICES.txt' ? fileURLToPath(new URL('./THIRD_PARTY_NOTICES.txt', import.meta.url)) : join(source, name);
export async function CopyAssets(destination, { overwrite = false } = {}) {
  if (typeof destination !== 'string' || !destination.trim()) throw new TypeError('A destination directory is required.');
  const target = resolve(destination), source = fileURLToPath(new URL('../vendor/', import.meta.url));
  await mkdir(target, { recursive: true });
  const root = await realpath(target);
  const within = (base, path) => { const p = relative(base, path); return p === '' || (!p.startsWith('..') && !isAbsolute(p)); };
  if (within(source, root) || within(root, source)) throw new Error('Destination must not contain or be inside the package vendor directory.');
  const native = JSON.parse(await readFile(join(source, 'native-build-manifest.json'), 'utf8'));
  // Validate all source and target files before writing any output. Never follow target file symlinks.
  for (const name of files) {
    const bytes = await readFile(sourceFile(source, name));
    if (native.artifacts[name] && createHash('sha256').update(bytes).digest('hex') !== native.artifacts[name]) throw new Error(`Native asset hash mismatch: ${name}`);
    try {
      const stat = await lstat(join(root, name));
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Refusing non-regular target: ${name}`);
      if (!overwrite) throw new Error(`Target exists: ${name}; pass --overwrite to replace it.`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const name of files) await copyFile(sourceFile(source, name), join(root, name), overwrite ? 0 : 1);
  return files.map(name => join(root, name));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) console.log('Usage: skiasharp-web-assets <public/skia> [--overwrite]\nCopies the pinned browser loader, WASM and license notices. No fonts are copied.');
  else if (args.length < 1 || args.length > 2 || args[0].startsWith('-') || (args[1] && args[1] !== '--overwrite')) { console.error('Usage: skiasharp-web-assets <directory> [--overwrite]'); process.exitCode = 1; }
  else CopyAssets(args[0], { overwrite:args.includes('--overwrite') }).then(paths => console.log(`Copied native assets to ${dirname(paths[0])}`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
