import { createDockingWorkspace } from '../packages/dxf-workspace/index.mjs';
import { createOfficePreview } from '../packages/dxf-office-preview/index.mjs';
import { createAnalysisUI } from '../packages/dxf-analysis/index.mjs';

const dockyard = window.AvalonDock;
window.RichTextWeb.registerRichTextWeb();
const values = new Map(), reveals = [], archives = [];
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
const ui = createAnalysisUI({ window, gridWeb: window.GridWeb, treeDataGridCore: window.TreeDataGridCore, treeDataGridWeb: window.TreeDataGridWeb });
const host = { window, gridWeb: window.GridWeb, richTextWeb: window.RichTextWeb, excel: window.XLSX,
  createArchiveView(container, options) {
    const view = new ui.AnalysisView(container, options); archives.push(view); return view;
  } };
const Preview = createOfficePreview(host), { Workspace } = createDockingWorkspace({ window, dockyard, storage });
function create(id) {
  const preview = new Preview({ onReveal: () => reveals.push(id) });
  const workspace = new Workspace({
    id, title: id, shell: document.getElementById(id), theme: 'light',
    presets: ['Default'], defaultPreset: 'Default',
    panels: [{ id: 'document', title: 'Preview ' + id, node: preview.node, kind: 'document', closable: false }],
    layout(w) { return new dockyard.LayoutRoot({ RootPanel: new dockyard.LayoutPanel({ Children: [
      new dockyard.LayoutDocumentPane({ Children: [w.make('document')] })
    ] }) }); }
  });
  workspace.onDispose(() => preview.dispose());
  return { preview, workspace };
}
const a = create('one'), b = create('two');
await a.preview.open(new TextEncoder().encode('Tag,Count\nPump,2'), 'one.csv');
await b.preview.open(new TextEncoder().encode('Tag,Count\nValve,3'), 'two.csv');
window.libraryDemo = { a, b, values, storage, reveals, archives, host, Workspace, Preview, createDockingWorkspace, createOfficePreview };
