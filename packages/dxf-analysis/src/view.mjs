export function createAnalysisServices(env) {
const { window, document, GridWeb, AbortController, Event, MutationObserver, ResizeObserver,
    navigator, Blob, URL, requestAnimationFrame, cancelAnimationFrame, getComputedStyle,
    setTimeout, clearTimeout } = env;

  const { element: el, scalar, text } = env.grid;
  const C = env.treeDataGridCore, W = env.treeDataGridWeb;
  const AVisuals = () => env.analysis?.AnalysisVisuals;
  const compare = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const flatten = roots => {
    const result = [], stack = [...roots].reverse(), seen = new Set();
    while (stack.length) {
      const row = stack.pop(); if (!row || seen.has(row)) continue;
      seen.add(row); result.push(row);
      for (let i = (row.children?.length || 0) - 1; i >= 0; i--) stack.push(row.children[i]);
    }
    return result;
  };
  const sourceControls = source => {
    if (!source) return [];
    const controls = [...source.querySelectorAll('button,a,input,select,textarea,[data-grid-action]')];
    if (source.matches('button,a,[data-grid-action],.cloud-tag,.diagnostics-stat,.rendering-block-card')) controls.unshift(source);
    return controls.filter(control => {
      if (control.closest('.dxf-grid-view')) return false;
      // A group's actions must never include every descendant's Show / Delete button.
      const owner = control.closest('li,tr,.block-card,.rule-item,.class-record,.diagnostic-item,.rendering-block-card');
      return !owner || owner === source || !source.contains(owner);
    });
  };
  const labelOf = control => control.getAttribute('aria-label') || control.title ||
    (control.matches('input,select,textarea') ? text(control.closest('label')) || control.dataset.action || control.name || control.type : text(control)) || 'Open';
  const button = (label, run, parent, title) => {
    const node = el('button', '', label); node.type = 'button'; if (title) node.title = title;
    node.addEventListener('click', run); parent?.append(node); return node;
  };
  const cellStyles = `
    .analysis-cell {display:flex;align-items:center;gap:6px;width:100%;min-width:0}
    .analysis-cell-text {overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .analysis-cell button {font:inherit;color:var(--tdg-accent,#165f98);background:none;border:0;padding:2px 3px;cursor:pointer;white-space:nowrap;text-decoration:underline;text-underline-offset:3px}
    .analysis-cell button:focus-visible {outline:2px solid var(--tdg-accent);outline-offset:1px}
    .analysis-cell button:disabled {opacity:.5;cursor:default}
    .analysis-cell input {accent-color:var(--tdg-accent);margin:0;width:16px;height:16px}
    .analysis-cell select {max-width:100%;font:inherit;background:var(--tdg-bg);color:var(--tdg-fg);border:1px solid var(--tdg-line)}
    .analysis-swatch {width:12px;height:12px;border:1px solid #888;border-radius:2px;flex:none}
    .analysis-badge {border:1px solid currentColor;border-radius:4px;padding:0 5px;font-size:11px;font-weight:600}
    .analysis-badge[data-severity=critical],.analysis-badge[data-severity=error] {color:var(--analysis-error,#b42318)}
    .analysis-badge[data-severity=warning] {color:var(--analysis-warning,#906000)}
    .analysis-bar {position:absolute;inset:5px auto 5px 1px;background:var(--tdg-selection);opacity:.8;pointer-events:none;border-radius:3px}
    .analysis-cell-numeric {justify-content:flex-end;font-variant-numeric:tabular-nums;position:relative}
    .analysis-cell-numeric span {z-index:1}
  `;

  class AnalysisView {
    constructor(container, options = {}) {
      if (container?.ownerDocument !== document) throw new TypeError('AnalysisView container must belong to the supplied window.');
      if (!C || !W) throw new Error('TreeDataGrid core and web APIs must be supplied.');
      this.container = container; this.title = options.title || 'Records'; this.options = options;
      this.columns = (options.columns?.length ? options.columns : ['Value']).map(c => typeof c === 'string' ? { title: c } : { ...c });
      this.rows = []; this.visibleRows = []; this.selectedKey = null; this.direction = 1;
      this.expanded = new Map(); this.facetValues = new Map(); this.columnChecks = [];
      this.abort = new AbortController(); this.disposed = false; this.mode = 'records'; this.theme = 'light';
      this.host = el('section', 'dxf-grid-view dxf-analysis-view');
      this.host.setAttribute('aria-label', this.title); this.host.dataset.gridTitle = this.title;
      this.host.gridView = this; this.host.analysisView = this;
      if (options.height) this.host.style.setProperty('--analysis-height', `${options.height}px`);
      this.heading = el('div', 'analysis-heading');
      this.heading.append(el('strong', '', this.title)); this.count = el('span', 'dxf-grid-count');
      this.count.setAttribute('role', 'status'); this.heading.append(this.count);
      this.modeButtons = el('div', 'analysis-modes'); this.modeButtons.setAttribute('role', 'group');
      this.modeButtons.setAttribute('aria-label', 'Report presentation');
      this.recordsButton = button('Records', () => this.setMode('records'), this.modeButtons);
      this.sheetButton = button('Spreadsheet', () => this.setMode('spreadsheet'), this.modeButtons);
      this.sheetButton.disabled = !GridWeb;
      this.detailButton = button('Details', () => this.toggleDetails(), this.modeButtons);
      this.detailButton.setAttribute('aria-pressed', 'true'); this.heading.append(this.modeButtons);
      if (env.onExpand && options.docking !== false) button('Expand analysis', () => this.runAction(() => env.onExpand(this), false), this.modeButtons,
        'Use the full workspace for this analysis');
      this.bar = el('div', 'dxf-grid-toolbar analysis-toolbar');
      this.search = el('input'); this.search.type = 'search'; this.search.placeholder = `Search ${this.title.toLowerCase()}…`;
      this.search.setAttribute('aria-label', `Filter ${this.title}`);
      this.scope = el('select'); this.scope.setAttribute('aria-label', `Search column in ${this.title}`);
      this.option(this.scope, '-1', 'All columns'); this.columns.forEach((c, i) => this.option(this.scope, i, c.title));
      this.sort = el('select'); this.sort.setAttribute('aria-label', `Sort ${this.title}`);
      this.option(this.sort, '-1', 'Original order'); this.columns.forEach((c, i) => this.option(this.sort, i, c.title));
      this.order = button('↑', () => { this.direction *= -1; this.applySort(); }, null, 'Reverse sort order');
      this.reset = button('Reset filters', () => this.clearFilters());
      this.bar.append(this.search, this.scope, this.sort, this.order, this.reset);
      this.columnMenu = el('details', 'analysis-column-menu'); this.columnMenu.append(el('summary', '', 'Columns'));
      this.columnOptions = el('div'); this.columnMenu.append(this.columnOptions); this.bar.append(this.columnMenu);
      button('Copy', () => this.copySelection(), this.bar, 'Copy selected records as tab-separated text');
      button('CSV', () => this.exportCsv(), this.bar, 'Export the filtered report; formula-like strings are escaped');
      this.facets = el('div', 'analysis-facets');
      this.empty = el('div', 'analysis-empty'); this.empty.setAttribute('role', 'status');
      this.main = el('div', 'analysis-main'); this.stage = el('div', 'analysis-stage');
      this.grid = el('tree-data-grid'); this.grid.setAttribute('aria-label', this.title + ' records');
      this.grid.RowHeight = 34; this.grid.CanUserResizeColumns = true; this.grid.CanUserSortColumns = true;
      this.grid.CanUserReorderColumns = true; this.grid.FrozenColumns = 1;
      this.stage.append(this.grid, this.empty);
      this.splitter = el('div', 'analysis-splitter'); this.splitter.tabIndex = 0;
      this.splitter.setAttribute('role', 'separator'); this.splitter.setAttribute('aria-label', 'Resize report details');
      this.splitter.setAttribute('aria-orientation', 'vertical');
      this.details = el('aside', 'dxf-grid-details analysis-details'); this.details.setAttribute('aria-label', 'Selected row');
      this.main.append(this.stage, this.splitter, this.details);
      this.host.append(this.heading, this.bar, this.facets, this.main); container.append(this.host);
      this.treeModel = new C.HierarchicalTreeDataGridSource([]);
      const presentation = new W.TreeDataGridPresentationOptions();
      this.columns.forEach((column, i) => {
        const key = 'analysis:' + i;
        const valueCompare = (a, b) => {
          const x = a.values[i], y = b.values[i];
          return typeof x === 'number' && typeof y === 'number' ? x - y : compare.compare(String(x ?? ''), String(y ?? ''));
        };
        presentation.Columns.Add(key, { create: row => this.cell(row, i) });
        const coreColumn = new C.TemplateColumn(column.title, key,
          column.width || (i === 0 ? 220 : /description|text|value|details/i.test(column.title) ? '2*' : 140), {
            MinWidth: new C.GridLength(i === 0 ? 130 : 65), CompareAscending: valueCompare,
            CompareDescending: (a, b) => -valueCompare(a, b)
          }, 'analysis-column-' + i);
        this.treeModel.Columns.Add(i === 0 ? new C.HierarchicalExpanderColumn(coreColumn, row => row.children || [],
          row => !!row.children?.length, row => row.expanded ?? this.expanded.get(row.key) ?? false,
          (row, value) => { row.expanded = value; if (!this.filtering) this.expanded.set(row.key, value); }) : coreColumn);
        const label = el('label'), check = el('input'); check.type = 'checkbox'; check.checked = true;
        check.setAttribute('aria-label', `Show ${column.title} column`);
        check.addEventListener('change', () => {
          // There must always be an identifiable row and an expander.
          if (i === 0) { check.checked = true; return; }
          coreColumn.IsVisible = check.checked;
        }, { signal: this.abort.signal });
        if (i === 0) check.disabled = true;
        label.append(check, document.createTextNode(column.title)); this.columnOptions.append(label); this.columnChecks.push([coreColumn, check]);
      });
      const actionKey = 'analysis:actions';
      presentation.Columns.Add(actionKey, { create: row => this.actionCell(row) });
      this.actionsColumn = new C.TemplateColumn('Actions', actionKey, 210, { CanUserSortColumn: false }, 'analysis-actions');
      this.treeModel.Columns.Add(this.actionsColumn);
      this.grid.PresentationOptions = presentation; this.grid.Model = this.treeModel;
      this.grid.SelectionMode = 2; this.treeModel.RowSelection.SingleSelect = false;
      const style = el('style'); style.textContent = cellStyles; this.grid.shadowRoot.append(style);
      // A frozen 220px identity column must not cover every action in a narrow dock.
      this.resizeObserver = new ResizeObserver(entries => {
        if (this.disposed) return;
        const width = entries[0]?.contentRect.width || 0;
        if (!width) return;
        const frozen = width >= 500 ? 1 : 0;
        if (this.grid.FrozenColumns !== frozen) this.grid.FrozenColumns = frozen;
      });
      this.resizeObserver.observe(this.grid);
      this.off = [this.treeModel.RowSelection.SelectionChanged.Subscribe(() => {
        if (this.updating) return;
        this.selectRow(this.treeModel.RowSelection.SelectedItems[0] || null);
      }), this.treeModel.Sorted.Subscribe(() => this.sorted()),
      this.treeModel.Rows.CollectionChanged.Subscribe(() => {
        // Rows are rebuilt once after an expansion transaction, unlike RowExpanded
        // which is raised before the flattened visible list is committed.
        this.updateVisible(); if (!this.updating) this.refreshSpreadsheet();
      })];
      this.search.addEventListener('input', () => { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.refresh(), 100); }, { signal: this.abort.signal });
      this.scope.addEventListener('change', () => this.refresh(), { signal: this.abort.signal });
      this.sort.addEventListener('change', () => this.applySort(), { signal: this.abort.signal });
      this.host.addEventListener('keydown', e => {
        const key = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && key === 'f') { e.preventDefault(); this.search.focus(); this.search.select(); }
        if (e.key === 'Escape' && e.target === this.search) { this.search.value = ''; this.refresh(); }
        // Don't let grid navigation or text editing trigger Dockyard's layout history.
        if (this.docking || e.composedPath().includes(this.grid) || (e.ctrlKey || e.metaKey) && ['f', 'a', 'c'].includes(key)) e.stopPropagation();
      }, { signal: this.abort.signal });
      this.splitter.addEventListener('keydown', e => {
        if (!['ArrowLeft','ArrowRight','Home'].includes(e.key)) return;
        e.preventDefault(); this.detailWidth = e.key === 'Home' ? 310 : Math.max(200, Math.min(650, (this.detailWidth || 310) + (e.key === 'ArrowLeft' ? 20 : -20)));
        this.host.style.setProperty('--analysis-detail-width', this.detailWidth + 'px');
      }, { signal: this.abort.signal });
      this.splitter.addEventListener('pointerdown', e => {
        e.preventDefault(); this.splitter.setPointerCapture(e.pointerId);
        this.drag = { x: e.clientX, width: this.details.getBoundingClientRect().width };
      }, { signal: this.abort.signal });
      this.splitter.addEventListener('pointermove', e => {
        if (!this.drag) return;
        this.detailWidth = Math.max(200, Math.min(this.main.clientWidth * .6, this.drag.width + this.drag.x - e.clientX));
        this.host.style.setProperty('--analysis-detail-width', this.detailWidth + 'px');
      }, { signal: this.abort.signal });
      for (const type of ['pointerup','pointercancel','lostpointercapture']) this.splitter.addEventListener(type, () => this.drag = null, { signal: this.abort.signal });
      this.setRows(options.rows || []); this.setMode('records');
      if (options.visualization !== false && AVisuals()) this.visuals = new (AVisuals())(this);
      if (env.createLayout && options.docking !== false) {
        // The non-docking presentation nests its chart inside the records stage.
        // The docking host requires independently owned, non-nested pane content.
        if (this.visuals) this.main.append(this.visuals.host);
        this.host.classList.add('has-analysis-docking');
        this.docking = env.createLayout({ container: this.main, records: this.stage, details: this.details,
          visual: this.visuals?.host, title: this.title,
          onResize: id => { if (id === 'records') this.refreshLayout(); if (id === 'visual') this.visuals?.schedule(); },
          onChange: () => {
            if (!this.docking || this.disposed) return;
            this.host.classList.toggle('analysis-details-hidden', !this.docking.isOpen('details'));
            this.detailButton.setAttribute('aria-pressed', String(this.docking.isVisible('details')));
            this.visuals?.layout();
          }
        });
        this.splitter.remove(); this.visuals?.grip.remove(); this.visuals?.layout();
        if (options.showDetails === false) this.toggleDetails(false);
      }
    }
    option(select, value, label) { const node = el('option', '', label); node.value = String(value); select.append(node); }
    setRows(rows) {
      if (this.disposed) return;
      this.closeDrill(); this.rows = rows; this.allRows = flatten(rows); this.byKey = new Map(this.allRows.map(row => [row.key, row]));
      this.maxima = this.columns.map((_, i) => this.allRows.reduce((max, row) => typeof row.values[i] === 'number' ? Math.max(max, row.values[i]) : max, 0));
      for (const key of this.expanded.keys()) if (!this.byKey.has(key)) this.expanded.delete(key);
      this.actionsColumn.IsVisible = this.allRows.some(row => this.actions(row).length > 0);
      this.buildFacets(); this.refresh();
    }
    buildFacets() {
      const active = new Map(this.facetValues); this.facets.replaceChildren();
      const hierarchy = this.rows.some(row => row.children?.length);
      if (hierarchy) {
        button('Expand all', () => this.treeModel.ExpandAll(), this.facets);
        button('Collapse all', () => this.treeModel.CollapseAll(), this.facets);
      }
      for (let i = 0; i < this.columns.length; i++) {
        const column = this.columns[i];
        if (!column.facet && !/^(severity|category|type|layer|application|enabled|origin|status|section)$/i.test(column.title)) continue;
        const values = new Map();
        for (const row of this.allRows) { const value = String(row.values[i] ?? ''); if (value !== '') values.set(value, (values.get(value) || 0) + 1); }
        if (!values.size || values.size > 100) continue;
        const select = el('select'); select.setAttribute('aria-label', `${column.title} filter`);
        this.option(select, '', `All ${column.title.toLowerCase()}`);
        for (const [value, count] of [...values].sort((a, b) => compare.compare(a[0], b[0]))) this.option(select, value, `${value} (${count})`);
        if (active.has(i) && !values.has(active.get(i))) this.option(select, active.get(i), `${active.get(i)} (0)`);
        select.value = active.get(i) || '';
        select.addEventListener('change', () => { if (select.value) this.facetValues.set(i, select.value); else this.facetValues.delete(i); this.refresh(); }, { signal: this.abort.signal });
        this.facets.append(select);
      }
      this.facets.hidden = !this.facets.childElementCount;
    }
    clearFilters() {
      this.search.value = ''; this.scope.value = '-1'; this.facetValues.clear(); this.visualFilter = null;
      this.buildFacets(); this.refresh();
    }
    refresh() {
      if (this.disposed) return;
      const query = this.search.value.trim().toLocaleLowerCase(), scope = Number(this.scope.value);
      this.filtering = !!query || this.facetValues.size > 0 || !!this.visualFilter;
      const selected = this.selectedKey, scroll = this.grid.Scroll?.Offset;
      const matchesData = row => (!query || (scope >= 0 ? [row.values[scope]] : row.values).some(v => String(scalar(v)).toLocaleLowerCase().includes(query))) &&
        [...this.facetValues].every(([i, value]) => String(row.values[i] ?? '') === value);
      this.contextRows = this.allRows.filter(row => !row.hidden && matchesData(row));
      const matches = row => matchesData(row) && (!this.visualFilter || this.visualFilter.keys.has(row.key));
      this.matchingRows = this.contextRows.filter(row => !this.visualFilter || this.visualFilter.keys.has(row.key));
      // Iterative postorder avoids unbounded recursion on handle-owner hierarchies.
      const projected = new Map();
      for (let i = this.allRows.length - 1; i >= 0; i--) {
        const row = this.allRows[i]; if (row.hidden) continue;
        const children = (row.children || []).map(r => projected.get(r)).filter(Boolean);
        if (!this.filtering || matches(row) || children.length) projected.set(row, {
          ...row, children: this.filtering && matches(row) ? (row.children || []).filter(r => !r.hidden).map(r => projected.get(r) || this.copyBranch(r)) : children,
          expanded: this.filtering ? true : this.expanded.get(row.key) ?? row.expanded ?? false
        });
      }
      this.filteredTree = this.rows.map(row => projected.get(row)).filter(Boolean);
      this.filteredRows = flatten(this.filteredTree);
      this.updating = true; this.treeModel.Items = this.filteredTree;
      this.updateVisible();
      const matchRow = this.visibleRows.find(row => row.key === selected) || this.visibleRows[0] || null;
      this.treeModel.RowSelection.Clear();
      if (matchRow) this.treeModel.RowSelection.SelectedIndex = this.treeModel.FindModelIndex(matchRow);
      this.updating = false;
      if (scroll && this.grid.Scroll) this.grid.Scroll.Offset = scroll;
      this.empty.hidden = this.filteredRows.length > 0;
      this.empty.textContent = this.allRows.length ? 'No matching records. Clear filters to see the complete report.' : (this.options.emptyMessage || 'No records in this drawing.');
      this.reset.hidden = !this.filtering;
      this.count.removeAttribute('data-error');
      this.count.textContent = `${this.filteredRows.length.toLocaleString()} / ${this.allRows.length.toLocaleString()} records`;
      this.selectRow(matchRow, false); this.refreshSpreadsheet(); this.options.onFilterChange?.(this); this.visuals?.schedule(); this.visuals?.renderFilter();
    }
    setVisualFilter(filter) {
      this.visualFilter = filter ? { label: String(filter.label), keys: new Set(filter.keys) } : null;
      this.refresh();
    }
    revealKey(key) {
      if (!this.byKey.has(key)) return false;
      if (!this.filteredRows.some(row => row.key === key)) this.clearFilters();
      const parents = new Map();
      for (const row of this.allRows) for (const child of row.children || []) parents.set(child.key, row.key);
      const seen = new Set();
      for (let parent = parents.get(key); parent != null && !seen.has(parent); parent = parents.get(parent)) {
        seen.add(parent); this.expanded.set(parent, true);
      }
      this.refresh(); this.selectKey(key);
      const row = this.visibleRows.find(row => row.key === key);
      if (row) this.grid.BringIntoView(this.treeModel.FindModelIndex(row));
      return !!row;
    }
    pinSelection() {
      if (!this.selectedRow) return;
      this.pinned = { key: this.selectedKey, values: this.selectedRow.values.map(scalar) };
      this.selectRow(this.selectedRow, false);
    }
    compareSelection() {
      if (!this.pinned || !this.selectedRow) return;
      this.openRelated({ title: 'Pinned record comparison', columns: ['Property', 'Pinned value', 'Selected value', 'Status'],
        rows: env.models.compareRows(this.columns, this.pinned, this.selectedRow), visualization: false });
    }
    copyBranch(root) {
      const copy = { ...root, children: [], expanded: true }, queue = [[root, copy]];
      for (let i = 0; i < queue.length; i++) for (const row of queue[i][0].children || []) if (!row.hidden) {
        const child = { ...row, children: [], expanded: true }; queue[i][1].children.push(child); queue.push([row, child]);
      }
      return copy;
    }
    updateVisible() { this.visibleRows = [...this.treeModel.Rows].map(row => row.Model); }
    applySort() {
      const index = Number(this.sort.value); this.order.textContent = this.direction > 0 ? '↑' : '↓';
      if (index < 0) this.treeModel.ClearSort();
      else this.treeModel.SortBy([...this.treeModel.Columns].find(c => c.Id === 'analysis-column-' + index), this.direction > 0 ? C.ListSortDirection.Ascending : C.ListSortDirection.Descending);
      this.updateVisible(); this.refreshSpreadsheet(); this.visuals?.schedule();
    }
    sorted() {
      const column = [...this.treeModel.Columns].find(c => c.SortDirection != null);
      this.sort.value = column ? column.Id.replace('analysis-column-', '') : '-1';
      this.direction = !column || column.SortDirection === C.ListSortDirection.Ascending ? 1 : -1;
      this.order.textContent = this.direction > 0 ? '↑' : '↓'; this.updateVisible(); this.refreshSpreadsheet(); this.visuals?.schedule(); this.visuals?.schedule();
    }
    cell(row, index) {
      const node = el('span', 'analysis-cell'), value = row.values[index];
      const column = this.columns[index]; let control = column.control?.(row);
      if (!control && row.source?.tagName === 'TR') control = row.source.cells[index]?.querySelector('input,select,textarea');
      if (!control && typeof value === 'boolean') control = sourceControls(row.source).find(c => c.type === 'checkbox');
      if (control) { node.append(this.control(control, row, column.title, true)); return node; }
      if (typeof value === 'boolean') { node.append(el('span', 'analysis-cell-text', value ? 'Yes' : 'No')); return node; }
      if (/severity|status/i.test(column.title) && value) {
        const badge = el('span', 'analysis-badge', value); badge.dataset.severity = String(value).toLowerCase(); node.append(badge); return node;
      }
      const label = el('span', 'analysis-cell-text', scalar(value)); label.title = String(scalar(value));
      if (typeof value === 'number') {
        node.classList.add('analysis-cell-numeric');
        if (column.bar && this.maxima[index] > 0) { const bar = el('i', 'analysis-bar'); bar.style.width = Math.min(100, 100 * value / this.maxima[index]) + '%'; node.append(bar); }
      }
      if (column.swatch && row.source) {
        const swatch = row.source.querySelector(column.swatch); if (swatch) { const chip = el('span', 'analysis-swatch'); chip.style.backgroundColor = swatch.style.backgroundColor || getComputedStyle(swatch).backgroundColor; node.append(chip); }
      }
      node.append(label); return node;
    }
    actions(row) {
      return [...(row.actions || []), ...sourceControls(row.source).filter(c => !c.matches('input,select,textarea')).map(control => ({
        label: control.matches('.rendering-block-card') ? 'Highlight block' : labelOf(control), disabled: control.disabled,
        run: () => { control.click(); this.renderRevealed(row.source); }
      }))];
    }
    actionCell(row) {
      const node = el('span', 'analysis-cell'), actions = this.actions(row);
      for (const action of actions.slice(0, 2)) {
        const b = button(action.label, e => { e.stopPropagation(); this.selectKey(row.key); this.runAction(() => action.run(row), action.requiresSource !== false); }, node);
        b.disabled = !!action.disabled; b.setAttribute('aria-label', `${action.label}: ${String(row.values[0] ?? '')}`);
      }
      if (actions.length > 2) button('More…', e => { e.stopPropagation(); this.selectKey(row.key); this.toggleDetails(true); }, node);
      return node;
    }
    guardSource() {
      const root = this.host.closest('[data-source-tab-id]');
      const id = root?.dataset.sourceTabId;
      if (id) env.activateSource?.(id);
    }
    async runAction(run, requiresSource = true) {
      if (this.disposed) return;
      try { if (requiresSource) this.guardSource(); await run(); if (!this.disposed) this.onSourceChange?.(); return true; }
      catch (error) { if (!this.disposed) { this.count.textContent = error.message; this.count.dataset.error = 'true'; } return false; }
    }
    control(control, row, name = labelOf(control), compact = false) {
      const field = el(control.tagName.toLowerCase());
      if (control.tagName === 'INPUT') field.type = control.type;
      for (const attr of ['min','max','step','placeholder']) if (control.hasAttribute(attr)) field.setAttribute(attr, control.getAttribute(attr));
      if (control.tagName === 'SELECT') for (const option of control.options) this.option(field, option.value, option.text);
      field.value = control.value; field.checked = control.checked; field.disabled = control.disabled;
      field.setAttribute('aria-label', compact ? `${name}: ${row.values[0]}` : name);
      field.addEventListener('click', event => event.stopPropagation());
      for (const type of ['input','change']) field.addEventListener(type, () => this.runAction(() => {
        control.value = field.value; if (control.type === 'checkbox') control.checked = field.checked;
        control.dispatchEvent(new Event(type, { bubbles: true }));
        // Properties are not MutationObserver attributes. Explicitly request a source re-read.
        if (type === 'change') this.onSourceChange?.();
      }).then(ok => {
        // A rejected stale-source edit must not leave a visually toggled proxy.
        if (!ok) { field.value = control.value; field.checked = control.checked; }
      }));
      return field;
    }
    selectKey(key) {
      const row = this.visibleRows.find(row => row.key === key);
      if (!row) return;
      this.updating = true; this.treeModel.RowSelection.Clear(); this.treeModel.RowSelection.SelectedIndex = this.treeModel.FindModelIndex(row); this.updating = false;
      this.selectRow(row);
    }
    selectIndex(index) { if (this.visibleRows[index]) this.selectKey(this.visibleRows[index].key); }
    selectRow(row, recordHistory = true) {
      if (this.disposed) return;
      const previousKey = this.selectedKey, previousTab = this.detailTab || 'details';
      const previousScroll = this.detailBody?.scrollTop || 0;
      this.selectedKey = row?.key ?? null; this.selectedRow = row;
      this.relatedView?.dispose(); this.relatedView = null; this.details.replaceChildren();
      if (!row) { this.details.append(el('p', 'analysis-empty', 'Select a record to inspect its values and actions.')); this.visuals?.selection(); return; }
      const toolbar = el('div', 'analysis-detail-heading');
      const previous = button('←', () => this.moveResult(-1), toolbar, 'Previous result');
      const next = button('→', () => this.moveResult(1), toolbar, 'Next result');
      previous.setAttribute('aria-label', 'Previous result'); next.setAttribute('aria-label', 'Next result');
      toolbar.append(el('strong', '', String(row.values[0] ?? 'Record'))); this.details.append(toolbar);
      const compareTools = el('div', 'analysis-compare-tools');
      button('Pin record', () => this.pinSelection(), compareTools, 'Capture these values as a comparison baseline');
      const diff = button('Compare', () => this.compareSelection(), compareTools, 'Compare the current record with the pinned snapshot'); diff.disabled = !this.pinned;
      if (this.pinned) { const pin = el('span', '', 'Pinned: ' + String(this.pinned.values[0] ?? 'record')); pin.title = pin.textContent; compareTools.append(pin); }
      this.details.append(compareTools);
      const actions = el('div', 'dxf-grid-actions');
      for (const action of this.actions(row)) { const b = button(action.label, () => this.runAction(() => action.run(row), action.requiresSource !== false), actions); b.disabled = !!action.disabled; }
      for (const control of sourceControls(row.source).filter(c => c.matches('input,select,textarea'))) {
        const label = el('label', 'dxf-grid-field'), name = this.columns.find(c=>c.control?.(row)===control)?.title || labelOf(control);
        label.append(el('span', '', name), this.control(control, row, name)); actions.append(label);
      }
      if (actions.childElementCount) this.details.append(actions);
      this.detailTabs = el('div', 'analysis-detail-tabs'); this.detailTabs.setAttribute('role', 'tablist');
      this.detailBody = el('div', 'analysis-detail-body'); this.related = this.collections(row);
      const raw = row.raw != null || row.source?.querySelector('pre');
      for (const [id, label] of [['details','Details'], ...(this.related.length ? [['related', `Related (${this.related.length})`]] : []), ...(raw ? [['raw','Raw data']] : [])]) {
        const b = button(label, () => this.showDetail(id), this.detailTabs); b.dataset.tab = id;
        b.setAttribute('role', 'tab'); b.id = `${env.idPrefix}-detail-${++AnalysisView.sequence}`; b.setAttribute('aria-controls', b.id + '-body');
      }
      this.details.append(this.detailTabs, this.detailBody);
      this.showDetail(previousKey === row.key && this.detailTabs.querySelector(`[data-tab="${previousTab}"]`) ? previousTab : 'details');
      if (previousKey === row.key) this.detailBody.scrollTop = previousScroll;
      this.options.onSelect?.(row); this.visuals?.selection();
    }
    moveResult(delta) {
      const index = this.visibleRows.findIndex(r => r.key === this.selectedKey), row = this.visibleRows[index + delta];
      if (row) { this.selectKey(row.key); this.grid.BringIntoView(this.treeModel.FindModelIndex(row)); }
    }
    collections(row) {
      const collections = [...(typeof row.related === 'function' ? row.related() : row.related || [])], source = row.source;
      if (!source || row.skipSourceCollections) return collections;
      for (const node of [...source.querySelectorAll('ul,ol,table')].filter(n => !source.contains(n.parentElement.closest('ul,ol,table')))) {
        const title = text(node.closest('details')?.querySelector('summary')) || text(node.previousElementSibling) || 'Related records';
        if (node.tagName === 'TABLE') {
          const header = node.tHead?.rows[0];
          collections.push({ title: title.slice(0, 70), columns: header ? [...header.cells].map(text) : ['Property','Value'],
            rows: [...node.rows].filter(n => n !== header).map((n, i) => ({ key: `${row.key}:related:${i}`, values: [...n.cells].map(env.grid.valueOf), source: n })) });
        } else collections.push({ title: title.slice(0, 70), columns: ['Record'], rows: listRecords(node) });
      }
      return collections;
    }
    showDetail(tab) {
      this.detailTab = tab; this.relatedView?.dispose(); this.relatedView = null;
      this.detailBody.replaceChildren();
      for (const b of this.detailTabs.children) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
      const selectedTab = [...this.detailTabs.children].find(b => b.dataset.tab === tab);
      this.detailBody.id = selectedTab.id + '-body'; this.detailBody.setAttribute('role', 'tabpanel'); this.detailBody.setAttribute('aria-labelledby', selectedTab.id);
      const row = this.selectedRow;
      if (tab === 'raw') {
        const pre = el('pre'); pre.textContent = typeof row.raw === 'function' ? row.raw() : row.raw ?? [...row.source.querySelectorAll('pre')].map(n => n.textContent).join('\n\n');
        this.detailBody.append(pre); return;
      }
      if (tab === 'related') {
        const select = el('select'); select.setAttribute('aria-label', 'Related collection');
        this.related.forEach((c, i) => this.option(select, i, `${c.title} (${flatten(c.rows || []).length})`));
        const toolbar=el('div','analysis-related-toolbar'); toolbar.append(select);
        button('Open full view',()=>this.openRelated(this.related[Number(select.value)]),toolbar);
        this.detailBody.append(toolbar); const host = el('div', 'analysis-related-host'); this.detailBody.append(host);
        const update = () => {
          this.relatedView?.dispose(); host.replaceChildren();
          this.relatedView = new AnalysisView(host, { visualization: false, ...this.related[Number(select.value)], height: 290, docking: false });
          this.relatedView.toggleDetails(false); this.relatedView.setTheme(this.theme);
        };
        select.addEventListener('change', update); update(); return;
      }
      const list = el('dl');
      row.values.forEach((v, i) => list.append(el('dt', '', this.columns[i]?.title || 'Value'), el('dd', '', scalar(v))));
      for (const [name, value] of row.metadata || []) list.append(el('dt', '', name), el('dd', '', scalar(value)));
      this.detailBody.append(list);
      if (row.source) {
        const extra = [...row.source.querySelectorAll(':scope > .block-card-line,:scope > .block-card-warning,:scope > p')];
        for (const item of extra) this.detailBody.append(el('p', item.classList.contains('block-card-warning') ? 'analysis-warning' : '', text(item)));
        const original = row.source.querySelector('canvas');
        if (original?.width && original?.height) {
          const canvas = el('canvas', 'dxf-grid-thumbnail'); canvas.width = original.width; canvas.height = original.height;
          canvas.setAttribute('aria-label', 'Selected block thumbnail'); canvas.getContext('2d').drawImage(original, 0, 0); this.detailBody.append(canvas);
        }
      }
      if (typeof row.preview === 'function') row.preview(this.detailBody);
    }
    openRelated(collection) {
      if (!collection || this.disposed) return;
      this.closeDrill(); this.drill = el('section', 'analysis-drill');
      this.drill.setAttribute('aria-label', collection.title + ' drill-down');
      const heading = el('div', 'analysis-drill-heading');
      const back=button('← Back to '+this.title, () => this.closeDrill(), heading);
      heading.append(el('span','',String(this.selectedRow?.values[0] || '')));
      const content=el('div','analysis-drill-content'); this.drill.append(heading,content); this.host.append(this.drill);
      this.drillView=new AnalysisView(content,{visualization:false,...collection}); this.drillView.setTheme(this.theme);
      this.drill.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.closeDrill();}});
      back.focus();
    }
    closeDrill() {
      if (!this.drill) return;
      this.drillView?.dispose(); this.drillView=null; this.drill.remove(); this.drill=null;
      this.detailTabs?.querySelector('[aria-selected=true]')?.focus();
    }
    renderRevealed(source) {
      if (source?.querySelector('pre')) { this.selectRow(this.selectedRow, false); this.showDetail('raw'); }
    }
    toggleDetails(value) {
      if (this.disposed) return;
      value ??= this.docking ? !this.docking.isVisible('details') : this.host.classList.contains('analysis-details-hidden');
      if (this.docking) { value ? this.docking.show('details') : this.docking.hide('details'); }
      this.host.classList.toggle('analysis-details-hidden', !value); this.detailButton.setAttribute('aria-pressed', String(value));
    }
    setMode(mode) {
      if (this.disposed) return;
      if (mode === 'spreadsheet' && !GridWeb) throw new Error('GridWeb must be supplied to use spreadsheet presentation.');
      if (!['records', 'spreadsheet'].includes(mode)) mode = 'records';
      if (this.visuals?.state.layout === 'visual') this.visuals.setLayout('split');
      if (this.docking) this.docking.show('records');
      this.mode = mode; this.recordsButton.setAttribute('aria-pressed', String(mode === 'records')); this.sheetButton.setAttribute('aria-pressed', String(mode === 'spreadsheet'));
      this.grid.hidden = mode !== 'records'; this.host.dataset.mode = mode;
      if (mode === 'spreadsheet' && !this.spreadsheet) {
        this.sheetHost = el('div', 'analysis-sheet-host'); this.stage.append(this.sheetHost);
        this.spreadsheet = new env.grid.GridView(this.sheetHost, { title: this.title + ' spreadsheet', columns: this.columns, showDetails: false,
          onSelect: row => { if (row && !this.updatingSheet) this.selectRow(row); } });
      }
      if (this.sheetHost) this.sheetHost.hidden = mode !== 'spreadsheet'; this.refreshSpreadsheet();
    }
    refreshSpreadsheet() {
      if (this.mode !== 'spreadsheet' || !this.spreadsheet) return;
      this.updatingSheet = true; this.spreadsheet.selectedKey = this.selectedKey;
      this.spreadsheet.setRows(this.visibleRows); this.spreadsheet.setTheme(this.theme); this.updatingSheet = false;
    }
    selectionText() {
      const rows = this.treeModel.RowSelection.SelectedItems;
      return [this.columns.map(c => c.title), ...(rows.length ? rows : this.selectedRow ? [this.selectedRow] : []).map(r => r.values)]
        .map(values => values.map(v => String(scalar(v)).replace(/\t/g, ' ').replace(/\r?\n/g, ' ')).join('\t')).join('\n');
    }
    copySelection() { return this.runAction(() => this.mode === 'spreadsheet' ? this.spreadsheet.grid.CopySelection() : navigator.clipboard.writeText(this.selectionText())); }
    csvText() {
      const field = value => {
        let s = String(scalar(value)); if (/^[=+\-@\t\r]/.test(s) && typeof value !== 'number') s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
      };
      // Explicitly the currently displayed tree projection, including sort and expansion.
      return [this.columns.map(c => c.title), ...this.visibleRows.map(r => r.values)].map(r => r.map(field).join(',')).join('\r\n');
    }
    exportCsv() {
      const url = URL.createObjectURL(new Blob(['\uFEFF', this.csvText()], { type: 'text/csv;charset=utf-8' }));
      const link = el('a'); link.href = url; link.download = this.title.replace(/[^a-z0-9_-]/gi, '-') + '.csv';
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    refreshLayout() { if (!this.disposed) { this.grid.InvalidateRowHeights(); this.spreadsheet?.grid.Refresh(); } }
    saveState() { return { docking: this.docking?.saveState(), search: this.search.value, scope: this.scope.value, sort: this.sort.value, direction: this.direction, selectedKey: this.selectedKey, expanded: [...this.expanded], facets: [...this.facetValues], mode: this.mode, details: !this.host.classList.contains('analysis-details-hidden'), detailTab: this.detailTab, visual: this.visuals?.saveState(), visualFilter: this.visualFilter ? {label:this.visualFilter.label,keys:[...this.visualFilter.keys]} : null, pinned: this.pinned, width: this.detailWidth, view: this.grid.SaveViewState() }; }
    restoreState(state) {
      if (!state) return;
      this.search.value = state.search || ''; this.scope.value = state.scope || '-1'; this.sort.value = state.sort || '-1'; this.direction = state.direction || 1;
      this.selectedKey = state.selectedKey; this.expanded = new Map(state.expanded || []); this.facetValues = new Map(state.facets || []);
      this.visualFilter = state.visualFilter ? {label:state.visualFilter.label,keys:new Set(state.visualFilter.keys)} : null; this.pinned = state.pinned;
      this.buildFacets(); this.refresh(); this.applySort();
      if (state.view) { try { this.grid.RestoreViewState(state.view); } catch (_) { /* Column schemas can evolve independently. */ } }
      this.toggleDetails(state.details !== false); this.setMode(state.mode || 'records'); this.visuals?.restore(state.visual);
      if (state.docking && this.docking) { try { this.docking.restoreState(state.docking); } catch (_) { this.docking.reset(); } }
      if (state.width) { this.detailWidth = state.width; this.host.style.setProperty('--analysis-detail-width', state.width + 'px'); }
      for (const [column, check] of this.columnChecks) check.checked = column.IsVisible !== false;
      if (this.detailTabs?.querySelector(`[data-tab="${state.detailTab}"]`)) this.showDetail(state.detailTab);
    }
    setTheme(theme) {
      this.theme = theme; this.host.dataset.theme = /dark|contrast/i.test(theme) ? 'dark' : 'light';
      this.docking?.setTheme(theme); this.spreadsheet?.setTheme(theme); this.relatedView?.setTheme(theme); this.drillView?.setTheme(theme); this.visuals?.schedule();
    }
    dispose() {
      if (this.disposed) return; this.disposed = true; clearTimeout(this.searchTimer); this.abort.abort();
      this.resizeObserver.disconnect(); this.docking?.dispose(); this.visuals?.dispose(); this.closeDrill(); this.relatedView?.dispose(); this.spreadsheet?.dispose(); this.off.forEach(off => off());
      this.grid.Dispose(); this.treeModel.Dispose(); this.rows = this.allRows = this.visibleRows = this.filteredRows = this.filteredTree = this.contextRows = this.matchingRows = []; this.related = []; this.selectedRow = this.pinned = this.visualFilter = null; this.byKey.clear(); this.details.replaceChildren(); this.host.remove();
    }
  }
  AnalysisView.sequence = 0;

  // Unlike the old Depth/Record projection, ownership and definition usages are
  // true parent/child records. Direct text omits descendants and action labels.
  function listRecords(source) {
    const build = node => {
      const clone = node.cloneNode(true); for (const child of clone.querySelectorAll('ul,ol,button,a,details,pre')) {
        if (child.matches('a') && !/show|open|navigate/i.test(text(child))) child.replaceWith(document.createTextNode(text(child)));
        else child.remove();
      }
      return { key: env.grid.keyFor(node), values: [text(clone) || text(node.querySelector('a'))], source: node, children: [], hidden: node.classList.contains('hidden') };
    };
    const roots = [], entries = new Map();
    for (const node of source.querySelectorAll('li')) {
      const row = build(node); entries.set(node, row); const parent = node.parentElement.closest('li');
      (entries.get(parent)?.children || roots).push(row);
    }
    return roots;
  }
  return { AnalysisView, flatten, listRecords, sourceControls, labelOf };
}
