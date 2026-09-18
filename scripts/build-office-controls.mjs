#!/usr/bin/env node
/** Rebuild from the exact upstream checkouts; no dependency downloads at app runtime.
 * Usage: node scripts/build-office-controls.mjs /path/to/GridWeb /path/to/RichTextWeb
 * Run `npm ci --ignore-scripts --legacy-peer-deps` in the pinned RichTextWeb checkout first.
 * This script does not fetch, modify, or execute anything in a user's Office document.
 */
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir,copyFile,writeFile,readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const pins={grid:'79fe32584e646a614a6549c8a14ea12e976b2e02',rich:'7f6242b6355b7448bf975a96f12aa18a161ea9a7'};
const [gridArg,richArg]=process.argv.slice(2);
if(!gridArg||!richArg)throw new Error('Provide the pinned GridWeb and RichTextWeb checkout directories.');
const grid=resolve(gridArg),rich=resolve(richArg);
for(const [name,path] of [['grid',grid],['rich',rich]]){
  const head=execFileSync('git',['-C',path,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if(head!==pins[name])throw new Error(`Wrong ${name} commit: ${head}`);
  if(execFileSync('git',['-C',path,'diff','HEAD','--','src','package-lock.json'],{encoding:'utf8'}).trim())throw new Error(`Modified ${name} source.`);
}
const {build}=await import(pathToFileURL(resolve(rich,'node_modules/esbuild/lib/main.js')).href);
await mkdir('vendor/gridweb',{recursive:true});await mkdir('vendor/richtextweb',{recursive:true});
const modulePath=path=>'./'+relative(process.cwd(),path).split('\\').join('/');
await build({stdin:{contents:`export * from ${JSON.stringify(modulePath(resolve(grid,'src/browser.js')))};export * from ${JSON.stringify(modulePath(resolve(grid,'src/io.js')))};export {readZip,writeZip} from ${JSON.stringify(modulePath(resolve(grid,'src/zip.js')))};`,resolveDir:process.cwd()},outfile:'vendor/gridweb/gridweb.global.js',bundle:true,format:'iife',globalName:'GridWeb',platform:'browser',target:'es2022',minify:true,legalComments:'linked',external:['node:zlib']});
await build({entryPoints:[resolve(rich,'src/index.ts')],outfile:'vendor/richtextweb/richtextweb.global.js',bundle:true,format:'iife',globalName:'RichTextWeb',platform:'browser',target:'es2022',minify:true,legalComments:'linked'});
for(const name of ['LICENSE','NOTICE.md'])await copyFile(resolve(grid,name),'vendor/gridweb/'+name);
for(const name of ['LICENSE','NOTICE'])await copyFile(resolve(rich,name),'vendor/richtextweb/'+name);
await copyFile(resolve(rich,'node_modules/mathjax-full/LICENSE'),'vendor/richtextweb/MATHJAX-LICENSE');
await copyFile(resolve(rich,'node_modules/mhchemparser/LICENSE.txt'),'vendor/richtextweb/MHCHEM-LICENSE');
for(const directory of ['vendor/gridweb','vendor/richtextweb']){
  const lines=[];
  for(const name of (await readdir(directory)).filter(n=>n!=='SHA256SUMS').sort())lines.push(createHash('sha256').update(await readFile(directory+'/'+name)).digest('hex')+'  '+name);
  await writeFile(directory+'/SHA256SUMS',lines.join('\n')+'\n');
}
console.log('Browser controls rebuilt; review the vendor diff and run browser integration tests before committing.');
