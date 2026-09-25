#!/usr/bin/env node
import {rmSync} from 'node:fs';
const args = process.argv.slice(2);
if (args.length > 1 || args.length === 1 && args[0] !== '--tests') {
    console.error('Usage: node scripts/clean.mjs [--tests]');
    process.exit(2);
}
for (const directory of ['../dist/', '../packages/dxf-skia/dist/', ...(args.includes('--tests') ? ['../test-results/'] : [])]) {
    rmSync(new URL(directory, import.meta.url), {recursive: true, force: true});
}
