#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'test-results/component-packages');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dxf-component-consumer-'));
const names = ['dxf-inspector', 'dxf-analysis', 'dxf-tree-view', 'dxf-drawing-tools', 'dxf-workspace', 'dxf-office-preview', 'dxf-rendering-view', 'dxf-state', 'dxf-command-line'];
const run = (command, args, cwd = temp) => execFileSync(command, args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000
});
fs.mkdirSync(output, { recursive: true });
try {
    fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({ name: 'isolated-component-consumer', private: true, type: 'module' }));
    const tarballs = [];
    for (const name of names) {
        const copy = path.join(temp, 'sources', name);
        fs.cpSync(path.join(root, 'packages', name), copy, { recursive: true });
        const pack = JSON.parse(run('npm', ['pack', '--offline', '--json', '--pack-destination', temp], copy))[0];
        assert.ok(pack.files.some(file => file.path === 'index.d.mts'));
        assert.ok(pack.files.some(file => file.path === 'LICENSE'));
        assert.ok(!pack.files.some(file => /(?:^dist\/|^tests\/|\.(?:ttf|otf|woff2?|shx)$)/i.test(file.path)));
        tarballs.push(path.join(temp, pack.filename));
        fs.copyFileSync(tarballs.at(-1), path.join(output, pack.filename));
    }
    // No dependency can be resolved from the checkout or a package's sibling.
    fs.rmSync(path.join(temp, 'sources'), { recursive: true, force: true });
    run('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs]);
    const consumer = `import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), before = new Set(Reflect.ownKeys(globalThis));
for (const name of ${JSON.stringify(names)}) {
    const specifier = '@wieslawsoltes/' + name;
    const esm = await import(specifier), cjs = require(specifier);
    assert.equal(esm, cjs);
    assert.equal(require(specifier + '/package.json').version, ['dxf-analysis','dxf-inspector'].includes(name) ? '0.3.0' : name === 'dxf-rendering-view' ? '0.2.0' : '0.1.0');
}
const commands = await import('@wieslawsoltes/dxf-command-line');
assert.deepEqual(commands.parseCommand('layout "Sheet A"').args, ['Sheet A']);
const commandSession = new commands.CommandSession({execute: command => command.command});
assert.equal((await commandSession.submit('help')).value, 'HELP');commandSession.dispose();
const I = await import('@wieslawsoltes/dxf-inspector');
const source = ${JSON.stringify(['0','SECTION','2','ENTITIES','0','CIRCLE','5','A','10','0','20','0','40','2','0','ENDSEC','0','EOF',''].join('\n'))};
const tree = new I.DxfParser().parse(source);
assert.equal(tree[0].children[0].type, 'CIRCLE');
assert.equal(I.TreeDiffEngine.computeDiff(tree, tree).leftRowClasses.size, 0);
assert.equal(I.inspectTree({originalTreeData:tree}).nodes.length,4);
assert.equal(I.referenceIndex(I.inspectTree({originalTreeData:tree})).outgoing.size,0);
const sourceMap = new WeakMap(), projected = I.filterSourceTree(tree, {objectTypes:['CIRCLE'],sourceMap});
assert.equal(sourceMap.get(projected[0]), tree[0]);
assert.equal(I.searchSourceTree(tree, {searchCode:5})[0].property, tree[0].children[0].properties.find(p=>p.code===5));
assert.equal(I.selectSourceNodes(tree,node=>node.type==='CIRCLE')[0], tree[0].children[0]);
I.sortSourceTree(projected,'objectCount');I.setSourceExpansion(projected,false);

const dock=await import('@wieslawsoltes/dxf-analysis');
assert.equal(dock.analysisArrangement(400,600),'tabs');
const model = await import('@wieslawsoltes/dxf-analysis/models');
assert.equal(model.aggregate, require('@wieslawsoltes/dxf-analysis/models').aggregate);
assert.equal(model.aggregate([{ key: 1, values: ['Pipe', 8] }], 0, 1).buckets[0].value, 8);
assert.deepEqual(Reflect.ownKeys(globalThis).filter(key => !before.has(key)), []);
console.log('All installed component packages: isolated ESM/CJS identity, public subpaths, source parsing and models pass.');
`;
    fs.writeFileSync(path.join(temp, 'consumer.mjs'), consumer);
    process.stdout.write(run(process.execPath, ['consumer.mjs']));
    fs.writeFileSync(path.join(temp, 'consumer.mts'), `
import { createCommandConsole, CommandSession, type CommandContext } from '@wieslawsoltes/dxf-command-line';
const session = new CommandSession<number>({execute: (context: CommandContext) => context.args.length});
session.submit('HELP').then(commandResult => { if (commandResult.status === 'ok') { const value: number = commandResult.value; } });
const Console = createCommandConsole({window});
const terminal = new Console({execute: context => context.write('Ready')});
terminal.write('Test');terminal.dispose();session.dispose();
// @ts-expect-error Commands are text, not arbitrary objects.
session.submit({command:'HELP'});
import { DxfParser, TreeDiffEngine, DXFDiagnosticsEngine, isHandleCode, inspectTree, referenceIndex, mtextPlain } from '@wieslawsoltes/dxf-inspector';
import { createAnalysisUI, createAnalysisDocking, analysisArrangement, createReportWorkspace, ReportBuffer, type ReportRow } from '@wieslawsoltes/dxf-analysis';
import { aggregate } from '@wieslawsoltes/dxf-analysis/models';
import { createTreeDataGrid } from '@wieslawsoltes/dxf-tree-view';
import { createDrawingViewTools, type NavigationHost } from '@wieslawsoltes/dxf-drawing-tools';
const tree = new DxfParser().parse('');
const id: number = tree[0].id;
const diff = TreeDiffEngine.computeDiff(tree, tree, { ignoreHandles: true });
const analysisIndex = inspectTree({id:'test',originalTreeData:tree});
referenceIndex(analysisIndex);mtextPlain('preview');
const diagnosis = new DXFDiagnosticsEngine(tree, 'test.dxf').runFullDiagnostics();
const rows: ReportRow<number>[] = [{ key: 1, values: ['Valve', 4] }];
const key: number = aggregate(rows, 0).buckets[0].keys[0];
declare const core: object, web: object, grid: object, renderer: object, dockyard: object;
const Docking = createAnalysisDocking({window, dockyard});
const ui = createAnalysisUI({ window, treeDataGridCore: core, treeDataGridWeb: web, gridWeb: grid,
    createLayout: options => new Docking({...options, storage:null}) });
const mode: 'balanced' | 'stacked' | 'tabs' = analysisArrangement(400,600);
// @ts-expect-error Analysis presets are deliberately finite.
analysisArrangement(400,600,'invalid');
const view = new ui.AnalysisView<number>(document.body, { rows });
view.selectKey(key); view.setTheme('dark'); view.dispose();
const Results = createReportWorkspace<number>({window, dockyard, createView: (container, options) => new ui.AnalysisView<number>(container, options)});
const reports = new Results({container:document.createElement('div'),maxDocuments:8});
const result=reports.add({title:'Query',columns:['Type','Count'],rows});
reports.append(result.id,{key:2,values:['Pump',3]});reports.arrange('horizontal');reports.dispose();
// @ts-expect-error Result arrangements are finite.
reports.arrange('unknown');
const buffer = new ReportBuffer<ReportRow<number>>({publish: rows => void rows, schedule: callback => setTimeout(callback,0),cancel: token => clearTimeout(token as number)});
buffer.append({key:3,values:['Valve']});buffer.dispose();
const SourceView = createTreeDataGrid({ window, isHandleCode });
const sourceView = new SourceView(document.body, document.createElement('div'));
sourceView.setData(tree); sourceView.selectedRowId = id; sourceView.dispose();
const tools = createDrawingViewTools(renderer, dockyard); tools.gridShape(4, 1200, 800); tools.gridShape(4);
// @ts-expect-error Camera linking modes are deliberately finite.
tools.transferCamera({}, {}, 'invalid');
import { createDockingWorkspace } from '@wieslawsoltes/dxf-workspace';
import { createOfficePreview, bytesOf } from '@wieslawsoltes/dxf-office-preview';
const { Workspace } = createDockingWorkspace({ window, dockyard, storage: null });
const previewType = createOfficePreview({ window });
const preview = new previewType(); preview.open(bytesOf(new ArrayBuffer(0)), 'file.txt');
preview.dispose();
// @ts-expect-error Workspace hosts must supply a layout factory.
new Workspace({ id: 'invalid', shell: document.body });
import { createRenderingServices, createPropertyInspector } from '@wieslawsoltes/dxf-rendering-view';
const rendering = createRenderingServices({ renderer });
const store = new rendering.RenderingDataController();
const doc = store.ingestDocument({tabId:'source', sourceText:''});
const surface = new rendering.RenderingSurfaceManager({initialize:async()=>({}), backend:'canvas'});
if (doc) surface.renderScene(doc.sceneGraph);
surface.subscribeFrame(frame => frame.screenToWorld({x:0,y:0}));
const Properties = createPropertyInspector({window});
const properties = new Properties(document.body);properties.setSections([{title:'Object',properties:[{name:'Layer',value:'PIPES'}]}]);
properties.dispose();surface.dispose();store.dispose();
// @ts-expect-error Backend names are finite.
new rendering.RenderingSurfaceManager({backend:'svg'});
import { StateManager, StateCodec, type SourceTab, type SaveTabResult } from '@wieslawsoltes/dxf-state';
const state = new StateManager({storage:null,limits:{maxTabs:4}});
const sourceTab: SourceTab = {id:'source',name:'drawing.dxf',originalTreeData:tree};
const saveResult: SaveTabResult = state.saveTabState(sourceTab);
const snapshot = state.buildExportSnapshot([sourceTab],[],sourceTab.id,null);
const codec = new StateCodec();
const restoredId: string | number = codec.restoreSnapshot(snapshot).leftTabs[0].id;
state.dispose();
// @ts-expect-error Storage is explicit and must implement the public contract.
new StateManager({storage:{setItem(){}}});
// @ts-expect-error Codec budgets are numbers, not strings.
new StateCodec({maxTabs:'many'});
import { filterSourceTree, searchSourceTree, selectSourceNodes, sortSourceTree,
    sourceSortValue, setSourceExpansion, DEFAULT_QUERY_LIMITS } from '@wieslawsoltes/dxf-inspector';
const projected = filterSourceTree(tree,{objectTypes:['CIRCLE'],sourceMap:new WeakMap(),limits:{maxDepth:128}});
const matchLine: number = searchSourceTree(tree,{searchCode:5,exact:true,maxResults:8})[0].line;
const selectedNodes = selectSourceNodes(tree, node => node.type==='CIRCLE');
sortSourceTree(projected,'objectCount',false);setSourceExpansion(projected,true);
sourceSortValue(projected[0],'dataSize');
// @ts-expect-error Unknown sort fields cannot be passed by typed consumers.
sortSourceTree(tree,'unknown');
// @ts-expect-error Predicates must be synchronous.
selectSourceNodes(tree,async node => node.type==='CIRCLE');
// @ts-expect-error Default budgets are immutable.
DEFAULT_QUERY_LIMITS.maxDepth=4;
void [id, diff, diagnosis, saveResult, restoredId,matchLine,selectedNodes];
`);
    fs.writeFileSync(path.join(temp, 'consumer.cts'), `import inspector = require('@wieslawsoltes/dxf-inspector');
const parser = new inspector.DxfParser();
const tree = parser.parse('');
import rendering = require('@wieslawsoltes/dxf-rendering-view');
const factory: typeof rendering.createRenderingServices = rendering.createRenderingServices;
import commands = require('@wieslawsoltes/dxf-command-line');
const terminal = new commands.CommandSession({execute: context => context.command});
terminal.submit('HELP').then(result => { if(result.status === 'ok') { const name: string = result.value; } });
terminal.dispose();
import state = require('@wieslawsoltes/dxf-state');
const codec = new state.StateCodec({maxTreeNodes:8});
void [tree, factory, codec];
`);
    process.stdout.write(run(process.env.TSC || 'tsc', ['--noEmit', '--strict', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', '--lib', 'es2022,dom', 'consumer.mts', 'consumer.cts']));
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ packages: Object.fromEntries(names.map(name => [name, JSON.parse(fs.readFileSync(path.join(root, 'packages', name, 'package.json'), 'utf8')).version])), node: process.version, offline: true, cjsEsmIdentity: true, declarations: true }, null, 2) + '\n');
    console.log('Component package packing, offline installation and strict MTS/CTS declarations passed.');
} finally {
    fs.rmSync(temp, { recursive: true, force: true });
}
