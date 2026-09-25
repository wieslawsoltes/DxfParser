// Application adapter: panel identity, host APIs and workspace lifecycle stay here.
import './analysis-services.mjs';
import { createOfficePreview, createOfficeDecoders, MAX_INPUT } from '../packages/dxf-office-preview/index.mjs';

window.RichTextWeb?.registerRichTextWeb();
const Control = createOfficePreview({
  window, gridWeb: window.GridWeb, richTextWeb: window.RichTextWeb, excel: window.XLSX,
  createArchiveView: (container, options) => new window.DxfAnalysis.AnalysisView(container, options)
});
const { legacyWord, legacyWorkbook } = createOfficeDecoders({
  gridWeb: window.GridWeb, richTextWeb: window.RichTextWeb, excel: window.XLSX
});
class OfficePreview extends Control {
  constructor() {
    super({ id: 'officeDocumentPreview', onReveal: () => this.workspace?.show('document-preview') });
  }
  attachWorkspace(workspace) {
    this.detachWorkspace?.();
    this.workspace = workspace;
    const button = document.createElement('button');
    button.className = 'dxf-office-launcher'; button.type = 'button'; button.textContent = 'Documents…';
    const show = () => workspace.show('document-preview'); button.addEventListener('click', show);
    workspace.toolbar.append(button);
    const theme = () => this.setTheme(String(workspace.manager.Theme?.Name || workspace.manager.Theme || 'light').toLowerCase());
    const unsubscribe = workspace.manager.ThemeChanged.add(theme);
    const removeDisposer = workspace.onDispose(() => this.dispose());
    this.detachWorkspace = () => {
      unsubscribe(); removeDisposer(); button.removeEventListener('click', show); button.remove();
      this.workspace = null; this.detachWorkspace = null;
    };
    theme();
  }
  dispose() { this.detachWorkspace?.(); super.dispose(); }
}
function createPanel(app) {
  const preview = app.officePreview = new OfficePreview();
  return { id: 'document-preview', title: 'Document Preview', node: preview.node, floating: true, width: 960, height: 700 };
}
window.DxfOffice = { OfficePreview, createPanel, legacyWord, legacyWorkbook, MAX_INPUT };
