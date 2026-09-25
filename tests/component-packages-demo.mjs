import * as inspector from '../packages/dxf-inspector/index.mjs';
import { createAnalysisUI } from '../packages/dxf-analysis/index.mjs';
import { createTreeDataGrid } from '../packages/dxf-tree-view/index.mjs';
import { createDrawingViewTools } from '../packages/dxf-drawing-tools/index.mjs';

const actions = [], sourceIds = [];
const host = { window, gridWeb: window.GridWeb, treeDataGridCore: window.TreeDataGridCore, treeDataGridWeb: window.TreeDataGridWeb,
    activateSource: id => sourceIds.push(id) };
const ui = createAnalysisUI(host), secondUI = createAnalysisUI(host);
const rows = [
    { key: 'one', values: ['Pipe', 12], actions: [{ label: 'Inspect', run: row => actions.push(row.key) }] },
    { key: 'two', values: ['Valve', 4] },
    { key: 'three', values: ['Pipe', 7] }
];
const view = new ui.AnalysisView(document.getElementById('report'), { title: 'Inventory', columns: ['Type', 'Count'], rows,
    visualization: { kind: 'distribution', group: 0, measure: 1 } });
const second = new secondUI.AnalysisView(document.getElementById('second'), { title: 'Independent', columns: ['Type', 'Count'], rows });
const source = '0\nSECTION\n2\nOBJECTS\n0\nACAD_PROXY_OBJECT\n5\nAB\n91\n42\n0\nENDSEC\n0\nEOF\n';
const tree = new inspector.DxfParser().parse(source);
for (const root of tree) root.expanded = true;
const Tree = createTreeDataGrid({ window, isHandleCode: inspector.isHandleCode,
    getClassNameById: id => id === 42 ? 'ExternalClass' : undefined,
    navigateToClassById: id => actions.push('class:' + id) });
const treeView = new Tree(document.getElementById('tree'), document.getElementById('tree-content'), { headerElement: document.getElementById('header') });
treeView.setData(tree);
window.componentDemo = { ui, secondUI, view, second, treeView, actions, sourceIds, createDrawingViewTools };
