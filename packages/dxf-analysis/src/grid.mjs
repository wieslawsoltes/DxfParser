export function createGridServices(env) {
const { window, document, GridWeb, AbortController, Event, MutationObserver, ResizeObserver,
    navigator, Blob, URL, requestAnimationFrame, cancelAnimationFrame, getComputedStyle,
    setTimeout, clearTimeout } = env;

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const scalar = value => value == null ? '' : typeof value === 'object'
    ? value instanceof Date ? value.toISOString() : JSON.stringify(value) : value;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  let sequence = 0;
  const keys = new WeakMap();
  const keyFor = node => {
    if (node.dataset.layer) return 'layer:' + node.dataset.layer;
    if (node.dataset.blockName) return 'block:' + node.dataset.blockName;
    if (node.dataset.ruleId) return 'rule:' + node.dataset.ruleId;
    if (!keys.has(node)) keys.set(node, 'record-' + ++sequence);
    return keys.get(node);
  };
  function text(node) { return node?.textContent?.replace(/\s+/g, ' ').trim() || ''; }
  function directText(node) {
    return [...node.childNodes].filter(n => n.nodeType === 3 ||
      !n.matches?.('ul,ol,table,button,pre,details,.dxf-grid-view,.dxf-grid-source'))
      .map(n => text(n)).join(' ').replace(/\s+/g, ' ').trim();
  }
  function valueOf(cell) {
    const field = cell?.querySelector('input,select,textarea');
    if (field) return field.type === 'checkbox' ? field.checked : field.type === 'range' ? Number(field.value) : field.value;
    const result = text(cell);
    return /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(result) && Number.isSafeInteger(Number(result.replace('.', '')))
      ? Number(result) : result;
  }

  class GridView {
    constructor(container, { title = 'Data', columns = [], rows = [], height, onSelect, showDetails = true } = {}) {
      if (!GridWeb) throw new Error('The local GridWeb distribution is not loaded.');
      this.container = container;
      this.columns = columns.map(c => typeof c === 'string' ? { title: c } : c);
      this.rows = []; this.visibleRows = []; this.selectedKey = null; this.direction = 1;
      this.onSelect = onSelect; this.showDetails = showDetails; this.disposed = false;
      this.abort = new AbortController();
      this.host = element('section', 'dxf-grid-view');
      this.host.setAttribute('aria-label', title);
      this.host.dataset.gridTitle = title;
      this.host.gridView = this;
      if (height) this.host.style.setProperty('--dxf-grid-height', height + 'px');
      this.bar = element('div', 'dxf-grid-toolbar');
      this.search = element('input'); this.search.type = 'search'; this.search.placeholder = 'Filter rows…';
      this.search.setAttribute('aria-label', 'Filter ' + title);
      this.sort = element('select'); this.sort.setAttribute('aria-label', 'Sort ' + title);
      const original = element('option', '', 'Original order'); original.value = '-1'; this.sort.append(original);
      this.columns.forEach((column, i) => { const o = element('option', '', column.title); o.value = String(i); this.sort.append(o); });
      this.order = element('button', '', '↑'); this.order.type = 'button'; this.order.title = 'Reverse sort order';
      this.count = element('span', 'dxf-grid-count'); this.count.setAttribute('role', 'status');
      const copy = element('button', '', 'Copy'); copy.type = 'button'; copy.title = 'Copy selected cells';
      this.bar.append(this.search, this.sort, this.order, copy, this.count);
      this.grid = element('grid-web'); this.grid.ReadOnly = true; this.grid.setAttribute('aria-label', title);
      this.details = element('div', 'dxf-grid-details'); this.details.setAttribute('aria-label', 'Selected row');
      this.host.append(this.bar, this.grid, this.details); container.append(this.host);
      this.search.addEventListener('input', () => {
        clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.refresh(), 100);
      }, { signal: this.abort.signal });
      this.sort.addEventListener('change', () => this.refresh(), { signal: this.abort.signal });
      this.order.addEventListener('click', () => { this.direction *= -1; this.order.textContent = this.direction > 0 ? '↑' : '↓'; this.refresh(); }, { signal: this.abort.signal });
      copy.addEventListener('click', () => this.runAction(() => this.grid.CopySelection()), { signal: this.abort.signal });
      this.grid.addEventListener('selection-change', e => {
        if (this.updating) return;
        this.selectRow(this.visibleRows[e.detail.row - 1] || null);
      }, { signal: this.abort.signal });
      // Editing/navigation shortcuts inside controls must not become Dockyard layout undo/close commands.
      this.host.addEventListener('keydown', e => { if (e.composedPath().some(n => n === this.grid)) e.stopPropagation(); }, { signal: this.abort.signal });
      this.setRows(rows);
    }
    setRows(rows) {
      if (this.disposed) return;
      this.rows = rows; this.refresh();
    }
    refresh() {
      if (this.disposed) return;
      const query = this.search.value.toLocaleLowerCase();
      this.visibleRows = this.rows.filter(row => !row.hidden && (!query || row.values.some(v => String(scalar(v)).toLocaleLowerCase().includes(query))));
      const index = Number(this.sort.value);
      if (index >= 0) this.visibleRows = this.visibleRows.map((row, order) => ({ row, order }))
        .sort((a, b) => {
          const x = a.row.values[index], y = b.row.values[index];
          const result = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x ?? ''), String(y ?? ''));
          return this.direction * result || a.order - b.order;
        }).map(entry => entry.row);
      const previous = this.book;
      const book = new GridWeb.Workbook({ name: this.host.dataset.gridTitle });
      book.HistoryLimit = 0; book.CalculationMode = 'Manual';
      const sheet = book.ActiveWorksheet;
      const width = Math.max(1, this.columns.length);
      sheet.GetRange('A1').Resize(1, width).Values = [this.columns.length ? this.columns.map(c => c.title) : ['Value']];
      // Bounded writes; use Value, never Input, so DXF strings beginning '=' remain literal text.
      for (let start = 0; start < this.visibleRows.length; start += 2000) {
        const batch = this.visibleRows.slice(start, start + 2000).map(row => Array.from({ length: width }, (_, i) => scalar(row.values[i])));
        sheet.GetRange('A' + (start + 2)).Resize(batch.length, width).Values = batch;
      }
      sheet.FrozenRows = 1;
      this.columns.forEach((column, i) => sheet.SetColumnWidth(i, column.width || (i === 0 ? 180 : 240)));
      sheet.GetRange('A1').Resize(1, width).SetStyle({ font: { bold: true }, fill: '#e4edf5' });
      book.ClearHistory(); this.book = book;
      this.updating = true;
      const initialBook = this.grid.Workbook;
      this.grid.Workbook = book;
      this.grid.ReadOnly = true;
      let selected = this.visibleRows.findIndex(r => r.key === this.selectedKey);
      if (selected < 0 && this.visibleRows.length) selected = 0;
      this.grid.Select('A' + (selected + 2)); this.updating = false;
      if (initialBook !== book) initialBook?.Dispose();
      if (previous && previous !== initialBook) previous.Dispose();
      this.count.textContent = `${this.visibleRows.length.toLocaleString()} / ${this.rows.length.toLocaleString()} rows`;
      this.selectRow(selected >= 0 ? this.visibleRows[selected] : null);
    }
    selectRow(row) {
      this.selectionAbort?.abort(); this.selectionAbort = new AbortController();
      for (const view of this.relatedViews || []) view.dispose(); this.relatedViews = [];
      this.selectedKey = row?.key ?? null;
      this.selectedRow = row;
      this.details.replaceChildren(); this.details.hidden = !row || !this.showDetails;
      if (!this.showDetails) { this.onSelect?.(row); return; }
      if (!row) return;
      const full = element('details', 'dxf-grid-values');
      full.append(element('summary', '', 'Selected row details'));
      const list = element('dl');
      row.values.forEach((v, i) => list.append(element('dt', '', this.columns[i]?.title || 'Value'), element('dd', '', scalar(v))));
      full.append(list); this.details.append(full);
      const actions = element('div', 'dxf-grid-actions');
      for (const action of row.actions || []) {
        const button = element('button', '', action.label); button.type = 'button'; button.disabled = !!action.disabled;
        button.addEventListener('click', () => this.runAction(() => action.run(row)), { signal: this.selectionAbort.signal });
        actions.append(button);
      }
      if (row.source) { this.sourceActions(row.source, actions); this.addRelatedData(row.source, full); }
      this.details.append(actions);
      this.onSelect?.(row);
    }
    async runAction(run) {
      try { await run(); } catch (error) { this.count.textContent = error.message; this.count.dataset.error = 'true'; }
    }
    sourceActions(source, actions) {
      // Retain controller-owned DOM in the source projection. Action proxies invoke its
      // original listeners and inline commands; no handler strings are evaluated here.
      const controls = [...source.querySelectorAll('button,a,input,select,textarea,[data-grid-action]')];
      if (source.matches('button,a,[data-grid-action],.cloud-tag,.diagnostics-stat,.rendering-block-card')) controls.unshift(source);
      for (const control of controls) {
        if (control.closest('.dxf-grid-view')) continue;
        if (source.tagName === 'LI' && control.closest('li') !== source) continue;
        if (control.matches('button,a,[data-grid-action],.cloud-tag,.diagnostics-stat,.rendering-block-card')) {
          const button = element('button', '', (control.matches('.rendering-block-card') ? 'Highlight block' : text(control)) || control.title || 'Open'); button.type = 'button'; button.disabled = !!control.disabled;
          button.addEventListener('click', () => this.runAction(() => {
            control.click();
            // Existing disclosure commands keep their original state; expose revealed prose safely.
            this.renderRevealed(source);
          }), { signal: this.selectionAbort.signal });
          actions.append(button);
        } else {
          const label = element('label', 'dxf-grid-field');
          const name = control.getAttribute('aria-label') || text(control.closest('label')) || control.dataset.action || control.name || control.type;
          label.append(element('span', '', name));
          const input = element(control.tagName.toLowerCase());
          if (control.tagName === 'INPUT') input.type = control.type;
          for (const attr of ['min', 'max', 'step', 'placeholder']) if (control.hasAttribute(attr)) input.setAttribute(attr, control.getAttribute(attr));
          if (control.tagName === 'SELECT') for (const o of control.options) { const option = element('option', '', o.text); option.value = o.value; input.append(option); }
          input.value = control.value; input.checked = control.checked; input.disabled = control.disabled;
          input.setAttribute('aria-label', name);
          for (const type of ['input', 'change']) input.addEventListener(type, () => {
            control.value = input.value;
            if (control.type === 'checkbox') control.checked = input.checked;
            control.dispatchEvent(new Event(type, { bubbles: true }));
            if (type === 'change') this.onSourceChange?.();
          }, { signal: this.selectionAbort.signal });
          label.append(input); actions.append(label);
        }
      }
    }
    addRelatedData(source, details) {
      // Full metadata and nested collections remain available without restoring an
      // HTML table/list renderer. Construct secondary GridWeb views only on demand.
      const metadata = [...source.querySelectorAll(':scope > .block-card-line,:scope > .block-card-warning,:scope > p')]
        .map(node => ({ key: keyFor(node), values: [text(node)] }));
      if (metadata.length) this.relatedGrid(details, 'Additional metadata', ['Value'], () => metadata);
      const collections = [...source.querySelectorAll('ul,ol,table')].filter(node =>
        !node.parentElement.closest('ul,ol,table') || !source.contains(node.parentElement.closest('ul,ol,table')));
      for (const collection of collections) {
        const label = text(collection.closest('details')?.querySelector('summary')) || 'Related records';
        const isTable = collection.tagName === 'TABLE';
        const headers = isTable && collection.tHead?.rows[0];
        this.relatedGrid(details, label, headers ? [...headers.cells].map(text) : isTable ?
          Array.from({ length: collection.rows[0]?.cells.length || 1 }, (_, i) => 'Column ' + (i + 1)) : ['Depth', 'Record'], () =>
          isTable ? [...collection.rows].filter(row => row !== headers).map(row => ({ key: keyFor(row), values: [...row.cells].map(valueOf), source: row })) :
          [...collection.querySelectorAll('li')].map(row => {
            let depth = 0;
            for (let n = row.parentElement; n && n !== collection; n = n.parentElement) if (n.matches('ul,ol')) depth++;
            return { key: keyFor(row), values: [depth, directText(row)], source: row };
          }));
      }
      const original = source.querySelector('canvas');
      if (original?.width && original?.height) {
        const canvas = element('canvas', 'dxf-grid-thumbnail'); canvas.width = original.width; canvas.height = original.height;
        canvas.setAttribute('aria-label', 'Selected block thumbnail'); canvas.getContext('2d')?.drawImage(original, 0, 0); details.append(canvas);
      }
    }
    relatedGrid(parent, title, columns, rows) {
      const details = element('details', 'dxf-grid-related'); details.append(element('summary', '', title));
      let view;
      details.addEventListener('toggle', () => {
        if (details.open && !view) { view = new GridView(details, { title, columns, rows: rows(), height: 290 }); view.setTheme(this.theme); this.relatedViews.push(view); }
      }, { signal: this.selectionAbort.signal });
      parent.append(details);
    }
    renderRevealed(source) {
      this.details.querySelector('.dxf-grid-revealed')?.remove();
      const node = element('div', 'dxf-grid-revealed');
      for (const pre of source.querySelectorAll('pre')) if (pre.style.display !== 'none' && !pre.hidden) node.append(element('pre', '', pre.textContent));
      this.details.append(node);
    }
    setTheme(theme) { this.theme = theme; for (const view of this.relatedViews || []) view.setTheme(theme); this.grid.Theme = theme === 'dark' ? 'dark' : 'light'; this.grid.setAttribute('theme', theme === 'dark' ? 'dark' : 'light'); }
    dispose() {
      if (this.disposed) return;
      this.disposed = true; this.selectionAbort?.abort(); clearTimeout(this.searchTimer); this.abort.abort();
      for (const view of this.relatedViews || []) view.dispose(); this.relatedViews = [];
      this.grid.Dispose(); this.book?.Dispose(); this.rows = this.visibleRows = []; this.host.remove();
    }
  }

  /** Explicit legacy-report projection. Source nodes stay hidden and connected so
   * existing filtering, delegated actions and stable IDs continue to work. Only
   * GridWeb displays the records. No main TreeDataGrid container is observed. */
  class ReportRegistry {
    constructor(roots, descriptors = []) {
      this.roots = roots.filter(Boolean); this.descriptors = descriptors;
      this.states = new Map(); this.theme = 'light'; this.projections = new Set(); this.disposed = false; this.pending = false;
      this.observer = new MutationObserver(records => {
        if (records.some(r => !r.target.closest?.('.dxf-grid-view'))) this.schedule();
      });
      this.listen(); this.scan();
    }
    listen() { for (const root of this.roots) this.observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'], characterData: true }); }
    schedule() { if (this.pending || this.disposed) return; this.pending = true; queueMicrotask(() => { this.pending = false; if (!this.disposed) this.scan(); }); }
    scan() {
      this.observer.disconnect();
      try {
        for (const projection of [...this.projections]) {
          if (!this.roots.some(root => root.contains(projection.source) && root.contains(projection.view.host))) { if (projection.view.saveState) this.states.set(projection.stateKey, projection.view.saveState()); projection.view.dispose(); projection.container.remove(); this.projections.delete(projection); }
          else projection.update();
          // Session-level presentation state is bounded independently of document bytes.
          while (this.states.size > 128) this.states.delete(this.states.keys().next().value);
        }
        for (const descriptor of this.descriptors) {
          for (const root of this.roots) for (const source of root.querySelectorAll(descriptor.selector)) {
            if (source.closest('.dxf-grid-view,.dxf-grid-source')) continue;
            this.project(source, descriptor);
          }
        }
        for (const root of this.roots) {
          for (const source of root.querySelectorAll('table')) {
            if (!source.closest('.dxf-grid-view,.dxf-grid-source')) this.projectTable(source);
          }
          // Preserve parent-child relationships and action ownership instead of a Depth/Record spreadsheet.
          for (const source of root.querySelectorAll('ul,ol')) {
            if (source.closest('.dxf-grid-view,.dxf-grid-source')) continue;
            this.project(source, { title: source.previousElementSibling?.textContent || 'Records', columns: ['Record'],
              records: node => env.analysis.listRecords(node) });
          }
        }
      } finally { if (!this.disposed) this.listen(); }
    }
    projectTable(source) {
      const first = source.rows[0];
      const hasHeader = !!source.tHead || first && [...first.cells].every(cell => cell.tagName === 'TH');
      const header = source.tHead?.rows[0] || (hasHeader ? first : null);
      const width = first?.cells.length || 2;
      const columns = header ? [...header.cells].map(cell => text(cell)) : width === 2 ? ['Property', 'Value'] : Array.from({ length: width }, (_, i) => 'Column ' + (i + 1));
      const titles = { 'layer-manager-table': 'Layers', 'plot-style-table': 'Plot styles', 'layer-summary-table': 'Layer summary', 'rendering-attribute-table': 'Attributes' };
      this.project(source, { title: source.caption?.textContent || titles[source.className] || source.closest('section')?.querySelector('h3')?.textContent || 'Properties', columns,
        records: node => [...node.rows].filter(row => row !== header).map(row => ({
          key: keyFor(row), values: [...row.cells].map(valueOf), source: row, hidden: row.classList.contains('hidden')
        })) });
    }
    project(source, descriptor) {
      if (!descriptor.records(source).length) return null;
      const container = element('div', 'dxf-grid-projection'); source.before(container);
      if (descriptor.preserve) for (const node of source.querySelectorAll(descriptor.preserve)) container.before(node);
      source.hidden = true; source.classList.add('dxf-grid-source');
      const View = env.analysis?.AnalysisView || GridView;
      const view = new View(container, { title: String(descriptor.title || 'Data').slice(0, 100), columns: descriptor.columns });
      const root = this.roots.find(r => r.contains(source));
      const stateKey = [root?.id, root?.dataset.sourceTabId, descriptor.selector || source.id || source.className, descriptor.title].join('|');
      container.dataset.reportSource = source.id || descriptor.selector || '';
      descriptor.onMount?.(view);
      let signature = '';
      const projection = { source, view, container, stateKey, update() {
        container.hidden = source.matches('.rule-category-body,.diagnostics-category-content') && !source.classList.contains('expanded');
        const rows = descriptor.records(source);
        // Empty-state prose stays visible; populated source rows are never displayed.
        source.hidden = rows.length > 0;
        if (!rows.length) container.hidden = true;
        const next = JSON.stringify(rows.map(r => [r.key, r.values, r.hidden, r.source?.innerHTML, ...(env.analysis?.sourceControls(r.source) || []).map(c => [c.value, c.checked, c.disabled]) ]));
        if (signature !== next) { signature = next; view.setRows(rows); }
      } };
      view.onSourceChange = () => this.schedule();
      this.projections.add(projection); projection.update();
      view.restoreState?.(this.states.get(stateKey));
      view.setTheme(this.theme);
      return view;
    }
    removeRoots(roots) {
      const removed = new Set(roots);
      this.observer.disconnect();
      this.roots = this.roots.filter(root => !removed.has(root));
      for (const p of [...this.projections]) if (!this.roots.some(root => root.contains(p.source))) {
        p.view.dispose(); p.container.remove(); this.projections.delete(p); this.states.delete(p.stateKey);
      }
      if (!this.disposed) this.listen();
    }
    setTheme(theme) { this.theme = theme; for (const p of this.projections) p.view.setTheme(theme); }
    dispose() { this.disposed = true; this.observer.disconnect(); for (const p of this.projections) p.view.dispose(); this.projections.clear(); this.states.clear(); }
  }
  return { GridView, ReportRegistry, element, scalar, text, directText, keyFor, valueOf };
}
