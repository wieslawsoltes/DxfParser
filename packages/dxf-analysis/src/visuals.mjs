export function createAnalysisVisuals(env) {
const { window, document, GridWeb, AbortController, Event, MutationObserver, ResizeObserver,
    navigator, Blob, URL, XMLSerializer, requestAnimationFrame, cancelAnimationFrame, getComputedStyle,
    setTimeout, clearTimeout } = env;

    const A = env.analysis, M = env.models, { element: el } = env.grid;
    const NS = 'http://www.w3.org/2000/svg', fmt = n => Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';
    const short = (s, n = 34) => { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
    function svg(tag, attrs = {}, value) { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs))
        n.setAttribute(k, String(v)); if (value != null)
        n.textContent = String(value); return n; }
    function button(label, fn, parent, title) { const b = el('button', '', label); b.type = 'button'; if (title)
        b.title = title; b.onclick = fn; parent?.append(b); return b; }
    const profiles = {
        'Object type distribution': { group: 'Type', measure: 'Count', caption: 'Object counts by DXF type. Click a segment to inspect its records.' },
        'DXF Frequencies': { group: 'Value', measure: 'Count', section: 'Kind', caption: 'Object types and group codes have separate totals. Choose the population below.' },
        'Handle ownership': { group: 'Status', caption: 'Ownership anomalies and selected-object relationships. Cycles are not silently removed from the graph.' },
        'Dependencies': { group: 'Type', caption: 'Definitions and references. External paths are never fetched or assumed available.' },
        'Fonts and text styles': { group: 'Font / style / object', measure: 'References', scope: 'roots', caption: 'Font usage counts root font groups once; switch scope to inspect individual styles or text references.' },
        'Classes': { group: 'Application', caption: 'CLASS definitions grouped by their declaring application.' },
        'Line Types': { group: 'Name', measure: 'References', kind: 'gallery', caption: 'Basic dash/gap previews; complex shape and text elements remain available in the drawing renderer.' },
        'Texts': { group: 'Layer', kind: 'gallery', caption: 'Readable text and attributes; original formatting remains in Raw data. Preview is not CAD typesetting.' },
        'Binary Objects': { group: 'Type', measure: 'Bytes', caption: 'Embedded payload bytes by object type; select an object for Hex/Office inspection.' },
        'Proxy Objects': { group: 'Class', caption: 'Proxy classes and their references. Unresolved classes remain visible.' },
        'Object Sizes': { group: 'Type', measure: 'Characters', kind: 'histogram', caption: 'Distribution of subtree character counts, not file bytes. Nested parent and child totals must not be added.' },
        'Diagnostic Issues': { group: 'Category', kind: 'matrix', x: 'Severity', y: 'Category', caption: 'Issue counts by category and severity; click a cell to inspect exactly those findings.' },
        'Diagnostic Rules': { group: 'Category', kind: 'matrix', x: 'Enabled', y: 'Category', caption: 'Rule coverage by category and enabled state. Filtering also scopes Enable/Disable filtered.' },
        'Blocks & Inserts': { group: 'Block', measure: 'Instances', kind: 'gallery', caption: 'Definitions, insertion counts and unit warnings; all instances remain available in Related.' },
        'Block Definitions': { group: 'Block', kind: 'gallery', caption: 'Select a definition to inspect metadata and use its original highlight action.' },
        'Binary Data': { kind: 'bytes', caption: 'Byte distribution for the current hex page and report filters, not the whole file. Entropy is descriptive, not a file-type or security verdict.' },
        'Archive Entries': { group: 'Kind', measure: 'Bytes', caption: 'Archive entry sizes and file types; Preview and Download remain explicit user actions.' },
        'Drawing Information': { kind: 'gallery', caption: 'Drawing summary values; select a card to inspect the complete value.' },
        'Selection Properties': { group: 'Section', kind: 'gallery', caption: 'Properties grouped by section; pin a record to compare exact values.' },
        'Layers': { group: 'Visible', caption: 'Layer state overview. Existing visibility, lock and plot-style controls remain in Records.' },
        'Plot styles': { group: 'Color', caption: 'Plot configuration overview; inspect and edit values in Records.' }
    };
    class AnalysisVisuals {
        constructor(view) {
            this.view = view;
            this.profile = { ...(profiles[view.title] || {}), ...(view.options.visualization || {}) };
            if (view.title.startsWith('Batch Results'))
                this.profile = { group: 'File', caption: 'Matching records by file. The Line distribution locates query hits; file-at-line actions are unchanged.' };
            this.state = { layout: 'auto', kind: this.profile.kind || 'distribution', group: this.index(this.profile.group, 0), measure: this.index(this.profile.measure, -1), scope: this.profile.scope || 'all', x: this.index(this.profile.x, 0), y: this.index(this.profile.y, Math.min(1, view.columns.length - 1)), section: '' };
            this.disposed = false;
            this.dirty = true;
            this.frame = 0;
            this.height = 210;
            this.toggle = button('Visuals', () => this.setLayout(view.host.dataset.visualLayout === 'data' ? 'split' : 'data'), null, 'Show linked charts alongside the data');
            view.modeButtons.prepend(this.toggle);
            this.host = el('section', 'analysis-visuals');
            this.host.setAttribute('aria-label', view.title + ' visualization');
            this.host.hidden = true;
            this.tools = el('div', 'analysis-visual-tools');
            this.kind = this.select('Visualization', [['distribution', 'Distribution'], ['histogram', 'Histogram'], ['matrix', 'Matrix'], ['relationships', 'Relationships'], ['gallery', 'Cards / previews'], ['bytes', 'Byte distribution']], this.state.kind, v => { this.state.kind = v; this.schedule(); });
            this.group = this.select('Group visual by', view.columns.map((c, i) => [i, c.title]), this.state.group, v => { this.state.group = +v; this.schedule(); });
            this.measure = this.select('Measure visual by', [[-1, 'Record count'], ...view.columns.map((c, i) => [i, c.title])], this.state.measure, v => { this.state.measure = +v; this.schedule(); });
            this.scope = this.select('Visual population', [['all', 'All records'], ['roots', 'Root records'], ['leaves', 'Leaf records']], this.state.scope, v => { this.state.scope = v; this.schedule(); });
            this.section = this.select('Frequency population', [], this.state.section, v => { this.state.section = v; this.schedule(); });
            this.x = this.select('Matrix columns', view.columns.map((c, i) => [i, c.title]), this.state.x, v => { this.state.x = +v; this.schedule(); });
            this.y = this.select('Matrix rows', view.columns.map((c, i) => [i, c.title]), this.state.y, v => { this.state.y = +v; this.schedule(); });
            this.focus = button('Focus visual', () => this.setLayout((this.view.docking ? this.view.docking.focused === 'visual' : this.view.host.dataset.visualLayout === 'visual') ? 'split' : 'visual'), this.tools, 'Expand the visualization without losing your record selection');
            button('Chart data', () => this.openData(), this.tools, 'Inspect the exact numbers and source records used by the chart');
            this.save = button('Save SVG', () => this.saveSvg(), this.tools, 'Export the visible diagram as standalone SVG');
            this.caption = el('p', 'analysis-visual-caption', this.profile.caption || 'Explore distributions, numeric ranges and relationships without replacing the inspection table.');
            this.body = el('div', 'analysis-visual-body');
            this.footer = el('div', 'analysis-visual-footer');
            this.footer.setAttribute('role', 'status');
            this.host.append(this.tools, this.caption, this.body, this.footer);
            this.grip = el('div', 'analysis-visual-grip');
            this.grip.tabIndex = 0;
            this.grip.setAttribute('role', 'separator');
            this.grip.setAttribute('aria-label', 'Resize visualization');
            this.grip.setAttribute('aria-orientation', 'horizontal');
            this.grip.onkeydown = e => { if (['ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) {
                e.preventDefault();
                this.resizeHeight(e.key === 'Home' ? 210 : this.height + (e.key === 'ArrowDown' ? 20 : -20));
            } };
            this.grip.onpointerdown = e => { this.drag = { y: e.clientY, h: this.height }; this.grip.setPointerCapture(e.pointerId); e.preventDefault(); };
            this.grip.onpointermove = e => { if (this.drag)
                this.resizeHeight(this.drag.h + e.clientY - this.drag.y); };
            for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
                this.grip.addEventListener(ev, () => this.drag = null);
            view.stage.prepend(this.host, this.grip);
            this.filterBar = el('div', 'analysis-visual-filter');
            this.filterBar.hidden = true;
            view.facets.after(this.filterBar);
            this.observer = new ResizeObserver(() => this.layout());
            this.observer.observe(view.host);
            this.layout();
        }
        index(title, fallback) { const i = this.view.columns.findIndex(c => c.title === title); return i < 0 ? fallback : i; }
        select(label, choices, value, run) { const s = el('select'); s.setAttribute('aria-label', label); for (const [v, t] of choices) {
            const o = el('option', '', t);
            o.value = String(v);
            s.append(o);
        } s.value = String(value); s.onchange = () => run(s.value); this.tools.append(s); return s; }
        setLayout(layout) { if (!['auto', 'split', 'data', 'visual'].includes(layout))
            return;
            this.state.layout = layout;
            if (this.view.docking) {
                if (layout === 'visual') { if (this.view.docking.focused !== 'visual') this.view.docking.focus('visual'); }
                else { this.view.docking.restoreFocus(); if (layout === 'data') this.view.docking.hide('visual'); else this.view.docking.show('visual'); }
            }
            this.layout(); this.view.refreshLayout(); }
        resizeHeight(h) { this.height = Math.round(Math.max(150, Math.min(420, this.view.host.clientHeight * .6, h))); this.view.host.style.setProperty('--analysis-visual-height', this.height + 'px'); }
        layout() {
            if (this.disposed)
                return;
            if (this.view.docking) this.host.hidden = !this.view.docking.isOpen('visual');
            const w = this.view.host.clientWidth, h = this.view.host.clientHeight;
            const mode = this.view.docking ? this.view.docking.visualMode() : this.state.layout === 'auto' ? (w >= 820 && h >= 490 ? 'split' : 'data') : this.state.layout;
            if (this.view.host.dataset.visualLayout !== mode) {
                this.dirty = true;
                this.view.host.dataset.visualLayout = mode;
                this.host.hidden = this.view.docking ? !this.view.docking.isOpen('visual') : mode === 'data';
                this.grip.hidden = !!this.view.docking || mode !== 'split';
                this.toggle.setAttribute('aria-pressed', String(mode !== 'data'));
            }
            // A selected visualization tab is not a transient focused layout.
            // Update even when focus changes without changing visible pane count.
            this.focus.textContent = this.view.docking ? (this.view.docking.focused === 'visual' ? 'Restore visual layout' : 'Focus visual') : (mode === 'visual' ? 'Visual + data' : 'Focus visual');
            if (w && h && mode !== 'data' && this.dirty)
                this.schedule();
        }
        schedule() { this.dirty = true; if (this.disposed || this.host.hidden || this.frame || this.view.docking && !this.view.docking.isVisible('visual'))
            return; this.frame = requestAnimationFrame(() => { this.frame = 0; if (!this.disposed && !this.host.hidden)
            this.render(); }); }
        selection() { if (this.state.kind === 'relationships')
            this.schedule();
        else
            this.highlight(); }
        highlight() { for (const n of this.body.querySelectorAll('[data-row-index]')) {
            const target = n.matches('button') ? n : n.querySelector('button');
            target?.setAttribute('aria-pressed', String(this.chartRows?.[+n.dataset.rowIndex]?.key === this.view.selectedKey));
        } }
        population() {
            const v = this.view, matches = v.contextRows || v.allRows || [];
            let rows = matches;
            if (this.state.scope === 'roots') {
                const keys = new Set(v.rows.map(r => r.key));
                rows = rows.filter(r => keys.has(r.key));
            }
            if (this.state.scope === 'leaves')
                rows = rows.filter(r => !r.children?.length);
            const i = this.index(this.profile.section, -1);
            this.section.hidden = i < 0;
            if (i >= 0) {
                const choices = [...new Set(matches.map(r => String(r.values[i] ?? '')))];
                if (!choices.includes(this.state.section))
                    this.state.section = choices[0] || '';
                this.section.replaceChildren();
                for (const value of choices) {
                    const o = el('option', '', value);
                    o.value = value;
                    this.section.append(o);
                }
                this.section.value = this.state.section;
                rows = rows.filter(r => String(r.values[i] ?? '') === this.state.section);
            }
            return rows;
        }
        render() {
            this.dirty = false;
            const v = this.view, kind = this.state.kind;
            const focused = this.body.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null;
            this.body.replaceChildren();
            this.diagram = null;
            this.chartData = [];
            this.chartRows = [];
            this.kind.value = kind;
            this.group.hidden = !['distribution'].includes(kind);
            this.measure.hidden = !['distribution', 'histogram'].includes(kind);
            this.x.hidden = this.y.hidden = kind !== 'matrix';
            this.scope.hidden = ['relationships', 'bytes'].includes(kind);
            this.save.disabled = true;
            this.renderFilter();
            const rows = this.population();
            if (!rows.length) {
                this.body.append(el('p', 'analysis-visual-empty', 'No records in this population. Reset filters or select a different population.'));
                this.footer.textContent = '0 records';
                return;
            }
            try {
                if (kind === 'matrix')
                    this.drawMatrix(rows);
                else if (kind === 'relationships')
                    this.drawRelations();
                else if (kind === 'gallery')
                    this.drawGallery(rows);
                else if (kind === 'bytes')
                    this.drawBytes(rows);
                else {
                    const col = this.state.measure;
                    if (kind === 'histogram' && col < 0) {
                        this.body.append(el('p', 'analysis-visual-empty', 'Choose a numeric column in Measure visual by.'));
                        this.footer.textContent = 'A histogram counts records in non-overlapping numeric ranges.';
                        return;
                    }
                    const model = kind === 'histogram' ? M.histogram(rows, col) : M.aggregate(rows, this.state.group, col);
                    this.chartData = model.buckets;
                    this.chartTitle = kind === 'histogram' ? v.columns[col].title + ' ranges' : v.columns[this.state.group].title;
                    this.drawBars(kind === 'histogram' ? model.buckets : M.top(model.buckets, this.view.host.dataset.visualLayout === 'visual' ? 14 : 6), kind === 'histogram' || col < 0 ? 'Records' : v.columns[col].title);
                    this.footer.textContent = `${fmt(rows.length)} ${this.state.scope} records · ${fmt(model.buckets.length)} groups${model.excluded ? ' · ' + fmt(model.excluded) + ' nonnumeric/negative values excluded' : ''}. Click to filter; click again to clear.`;
                }
            }
            catch (error) {
                this.body.replaceChildren(el('p', 'analysis-visual-empty', 'Visualization unavailable: ' + error.message));
                this.footer.textContent = 'The inspection data remains available.';
            }
            finally {
                if (focused) {
                    const target = [...this.body.querySelectorAll('[role=button],button')].find(n => n.getAttribute('aria-label') === focused);
                    (target || this.kind).focus({ preventScroll: true });
                }
            }
        }
        renderFilter() {
            const f = this.view.visualFilter;
            this.filterBar.replaceChildren();
            this.filterBar.hidden = !f;
            if (!f)
                return;
            this.filterBar.title = 'Charts retain the search/facet context. This selection additionally filters the records and their inspection spreadsheet.';
            this.filterBar.append(el('span', '', `Visual filter: ${f.label}`));
            button('Clear visual filter', () => this.view.setVisualFilter(null), this.filterBar);
        }
        filter(bucket) {
            const v = this.view;
            const keys = new Set(bucket.keys);
            // A root aggregate includes its descendants for inspection, but the chart's
            // displayed numeric total still counts the selected population only.
            for (const key of bucket.keys) {
                const row = v.byKey.get(key);
                if (row?.children?.length)
                    for (const r of A.flatten([row]))
                        keys.add(r.key);
            }
            const same = v.visualFilter && keys.size === v.visualFilter.keys.size && [...keys].every(k => v.visualFilter.keys.has(k));
            v.setVisualFilter(same ? null : { label: bucket.label, keys });
        }
        activate(node, fn, label) { node.setAttribute('role', 'button'); node.setAttribute('tabindex', '0'); node.setAttribute('aria-label', label); node.onclick = fn; node.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            fn();
        } }; }
        makeSvg(height = 240, width = 760) { const n = svg('svg', { viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-label': this.view.title + ' ' + this.state.kind, preserveAspectRatio: 'xMidYMid meet' }); n.append(svg('title', {}, this.view.title)); if (this.view.docking) n.style.minWidth = width + 'px'; this.body.append(n); this.diagram = n; this.save.disabled = false; return n; }
        drawBars(buckets, unit) {
            // Docked charts use CSS-pixel geometry so a narrow pane does not shrink
            // twelve-pixel labels to four pixels. Only dense diagrams scroll.
            const width = this.view.docking ? Math.max(240, Math.min(1600, this.body.clientWidth - 16)) : 760;
            const labelWidth = this.view.docking ? Math.max(80, Math.min(270, width * .36)) : 280;
            const plotWidth = this.view.docking ? Math.max(60, width - labelWidth - 86) : 384;
            const n = this.makeSvg(Math.max(145, buckets.length * 27 + 26), width), max = Math.max(1, ...buckets.map(b => b.value));
            n.append(svg('text', { x: labelWidth, y: 15, class: 'av-muted' }, short(unit, Math.max(8, Math.floor((width - labelWidth) / 7)))));
            buckets.forEach((b, i) => {
                const y = 24 + i * 27, g = svg('g', { 'data-bucket': b.key, class: 'av-bar' });
                g.append(svg('title', {}, `${b.label}: ${fmt(b.value)} ${unit}; ${fmt(b.count)} records`));
                g.append(svg('rect', { x: 0, y, width: width - 2, height: 25, fill: 'transparent' }));
                g.append(svg('text', { x: 8, y: y + 17, class: 'av-label' }, short(b.label, Math.max(8, Math.floor((labelWidth - 12) / 7)))));
                g.append(svg('rect', { x: labelWidth, y: y + 4, width: Math.max(0, b.value / max * plotWidth), height: 17, rx: 3, class: 'av-fill' }));
                g.append(svg('text', { x: width - 10, y: y + 17, 'text-anchor': 'end', class: 'av-number' }, fmt(b.value)));
                const active = this.view.visualFilter && b.keys.length && b.keys.every(k => this.view.visualFilter.keys.has(k));
                g.setAttribute('aria-pressed', String(!!active));
                this.activate(g, () => this.filter(b), `${b.label}: ${fmt(b.value)} ${unit}; filter ${b.count} records`);
                n.append(g);
            });
        }
        drawMatrix(rows) {
            const m = M.matrix(rows, this.state.x, this.state.y), max = Math.max(1, ...m.cells.flat().map(c => c.value));
            this.chartTitle = 'Matrix cells';
            const labelWidth = this.view.docking ? 172 : 230;
            const totalWidth = this.view.docking ? Math.max(labelWidth + m.xs.length * 64 + 10, this.body.clientWidth - 16) : 760;
            const n = this.makeSvg(Math.max(150, 42 + m.ys.length * 28), totalWidth), width = (totalWidth - labelWidth - 10) / Math.max(1, m.xs.length);
            m.xs.forEach((b, i) => n.append(svg('text', { x: labelWidth + (i + .5) * width, y: 23, 'text-anchor': 'middle', class: 'av-muted' }, short(b.label, Math.floor(width / 7)))));
            m.ys.forEach((b, y) => {
                n.append(svg('text', { x: 8, y: 61 + y * 28, class: 'av-label' }, short(b.label, Math.floor((labelWidth - 12) / 7))));
                m.xs.forEach((x, i) => {
                    const c = m.cells[y][i], bucket = { ...c, label: b.label + ' / ' + x.label, count: c.value, key: `${y}:${i}` };
                    this.chartData.push(bucket);
                    const g = svg('g', { class: 'av-cell' });
                    g.append(svg('rect', { x: labelWidth + i * width, y: 42 + y * 28, width: width - 3, height: 25, rx: 3, class: 'av-fill', opacity: c.value ? .22 + .68 * c.value / max : .08 }));
                    g.append(svg('text', { x: labelWidth + (i + .5) * width, y: 60 + y * 28, 'text-anchor': 'middle', class: 'av-number' }, c.value));
                    g.append(svg('title', {}, bucket.label + ': ' + c.value));
                    if (c.value) {
                        g.setAttribute('aria-pressed', String(!!this.view.visualFilter && c.keys.every(k => this.view.visualFilter.keys.has(k))));
                        this.activate(g, () => this.filter(bucket), `${bucket.label}: ${c.value} records; filter`);
                    }
                    n.append(g);
                });
            });
            this.footer.textContent = `${fmt(rows.length)} records · ${this.view.columns[this.state.y].title} × ${this.view.columns[this.state.x].title}. Numbers remain visible without color.`;
        }
        choose(row) {
            if (!row)
                return;
            const v = this.view;
            if (v.byKey.has(row.key)) {
                if (v.visibleRows.some(r => r.key === row.key))
                    v.selectKey(row.key);
                else
                    v.revealKey(row.key);
                this.highlight();
            }
            else
                v.openRelated({ title: 'Related object', columns: ['Object', 'Type', 'Handle', 'Line', 'Layer'], rows: [row], visualization: false });
        }
        drawRelations() {
            const v = this.view, row = v.selectedRow;
            if (!row) {
                this.body.append(el('p', 'analysis-visual-empty', 'Select a record to explore relationships.'));
                return;
            }
            let relations = typeof row.relationships === 'function' ? row.relationships() : null;
            if (!relations) {
                const children = row.children || [], parent = (v.allRows || []).find(r => r.children?.some(c => c.key === row.key));
                relations = [...(parent ? [{ direction: 'in', label: 'Parent', row: parent }] : []), ...children.map(r => ({ direction: 'out', label: 'Child', row: r }))];
            }
            this.chartTitle = 'Relationships';
            this.relationRows = relations;
            this.chartData = relations.map((r, i) => ({ key: 'rel:' + i, label: `${r.direction === 'in' ? 'Incoming' : 'Outgoing'} · ${r.label} · ${r.row.values[0]}`, value: 1, count: 1, keys: [r.row.key] }));
            if (!relations.length) {
                this.body.append(el('p', 'analysis-visual-empty', 'No explicit relationships are available for this record. Details and Related retain all source metadata.'));
                this.footer.textContent = 'No relationship inferred from display labels.';
                return;
            }
            const incoming = relations.filter(r => r.direction === 'in'), outgoing = relations.filter(r => r.direction !== 'in'), left = incoming.slice(0, 6), right = outgoing.slice(0, 6);
            const h = Math.max(160, Math.max(left.length, right.length) * 42 + 28), n = this.makeSvg(h), cy = h / 2;
            const defs = svg('defs'), id = env.idPrefix + '-arrow-' + (++AnalysisVisuals.sequence), marker = svg('marker', { id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' });
            marker.append(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'av-arrow' }));
            defs.append(marker);
            n.append(defs);
            const node = (r, x, y, central = false) => { const g = svg('g', { class: 'av-node' }); g.append(svg('rect', { x, y, width: 210, height: 32, rx: 5, class: central ? 'av-center' : 'av-node-box' })); g.append(svg('text', { x: x + 8, y: y + 14, class: 'av-label' }, short(r.values[0], 29))); g.append(svg('text', { x: x + 8, y: y + 27, class: 'av-muted' }, short(central ? 'Selected record' : r.values.slice(1, 3).map(M.label).join(' · '), 35))); g.append(svg('title', {}, r.values.map(M.label).join(' · '))); this.activate(g, () => this.choose(r), 'Inspect ' + r.values.map(M.label).join(' · ')); n.append(g); };
            for (const [list, isLeft] of [[left, true], [right, false]])
                list.forEach((rel, i) => { const y = 18 + i * 42, from = isLeft ? [220, y + 16] : [485, cy], to = isLeft ? [275, cy] : [540, y + 16]; const edge = svg('path', { d: `M ${from[0]} ${from[1]} C 360 ${from[1]} 400 ${to[1]} ${to[0]} ${to[1]}`, class: 'av-edge', 'marker-end': `url(#${id})` }); edge.append(svg('title', {}, rel.label)); n.append(edge); node(rel.row, isLeft ? 10 : 540, y); });
            node(row, 275, cy - 16, true);
            this.footer.replaceChildren(el('span', '', `${incoming.length} incoming · ${outgoing.length} outgoing · displaying ${left.length + right.length}/${relations.length} links. Arrows follow reference direction.`));
            button('All relationships', () => v.openRelated({ title: 'All relationships', columns: ['Direction', 'Relationship', 'Object', 'Type', 'Handle', 'Line'], rows: relations.map((r, i) => ({ key: 'rel:' + i, values: [r.direction === 'in' ? 'Incoming' : 'Outgoing', r.label, ...r.row.values.slice(0, 4)], actions: v.actions(r.row), raw: r.row.raw, related: r.row.related, relationships: r.row.relationships })), visualization: false }), this.footer);
        }
        drawGallery(rows) {
            const v = this.view, list = rows.slice(), column = Number(v.sort.value), direction = v.direction;
            if (column >= 0) {
                const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
                list.sort((a, b) => { const x = a.values[column], y = b.values[column]; return direction * (typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x ?? ''), String(y ?? ''))); });
            }
            const start = Math.max(0, Math.min(list.length - 1, this.galleryStart || 0)), slice = list.slice(start, start + 6);
            this.chartRows = slice;
            this.chartTitle = 'Preview records';
            this.chartData = list.map(r => ({ key: r.key, label: M.label(r.values[0]), value: 1, count: 1, keys: [r.key] }));
            const gallery = el('div', 'analysis-preview-cards');
            slice.forEach((row, i) => {
                const card = el('article', 'analysis-preview-card');
                card.dataset.rowIndex = i;
                const b = button(short(row.values[0] ?? 'Record', 80), () => this.choose(row), card);
                b.setAttribute('aria-label', 'Inspect ' + String(row.values[0] ?? 'Record'));
                b.setAttribute('aria-pressed', String(row.key === v.selectedKey));
                const content = el('div', 'analysis-preview-content');
                if (typeof row.preview === 'function')
                    row.preview(content);
                else if (row.source?.querySelector('canvas')) {
                    const src = row.source.querySelector('canvas'), canvas = el('canvas');
                    canvas.width = src.width;
                    canvas.height = src.height;
                    canvas.setAttribute('aria-label', String(row.values[0]) + ' thumbnail');
                    canvas.getContext('2d')?.drawImage(src, 0, 0);
                    content.append(canvas);
                }
                const dl = el('dl');
                row.values.slice(1, 5).forEach((value, j) => { dl.append(el('dt', '', v.columns[j + 1]?.title || 'Value'), el('dd', '', M.label(value))); });
                content.append(dl);
                card.append(content);
                gallery.append(card);
            });
            this.body.append(gallery);
            this.footer.replaceChildren(el('span', '', `${fmt(start + 1)}–${fmt(Math.min(start + 6, list.length))} of ${fmt(list.length)} preview records. Select a card to inspect full values.`));
            const prev = button('Previous cards', () => { this.galleryStart = Math.max(0, start - 6); this.schedule(); }, this.footer), next = button('Next cards', () => { this.galleryStart = start + 6; this.schedule(); }, this.footer);
            prev.disabled = !start;
            next.disabled = start + 6 >= list.length;
        }
        drawBytes(rows) {
            const i = this.index('Hexadecimal', -1);
            if (i < 0) {
                this.body.append(el('p', 'analysis-visual-empty', 'Byte distribution is available in the Hex Viewer.'));
                this.footer.textContent = 'Open an embedded payload through Hex Viewer.';
                return;
            }
            const b = M.byteStats(rows, i);
            this.chartData = b.buckets;
            this.chartTitle = 'Byte ranges';
            this.drawBars(b.buckets, 'Bytes');
            this.footer.textContent = `Current page/filter: ${fmt(b.total)} bytes · ${fmt(b.printable)} printable ASCII · entropy ${b.entropy.toFixed(3)} bits/byte${b.invalid ? ' · ' + b.invalid + ' invalid rows excluded' : ''}. Click a range to inspect rows containing those bytes.`;
        }
        openData() {
            if (this.disposed)
                return;
            if (this.dirty)
                this.render();
            const v = this.view;
            if (this.state.kind === 'relationships') {
                this.footer.querySelector('button')?.click();
                return;
            }
            const data = this.chartData || [];
            v.openRelated({ title: this.chartTitle || 'Chart data', columns: ['Group / range', 'Value', 'Records'], rows: data.map((b, i) => ({ key: 'chart:' + i, values: [b.label, b.value, b.count], metadata: Number.isFinite(b.lo) ? [['Lower bound (inclusive)', b.lo], ['Upper bound', b.hi], ['Upper bound is inclusive', i === data.length - 1]] : [], actions: [{ label: 'Inspect records', requiresSource: false, run: () => { v.closeDrill(); this.filter(b); } }], related: () => [{ title: b.label, columns: v.columns, rows: b.keys.map(k => v.byKey.get(k)).filter(Boolean), visualization: false }] })), visualization: false });
        }
        saveSvg() {
            if (!this.diagram)
                return;
            // Resolve theme/forced-color styles on the live nodes. The exported SVG is
            // self-contained: literal text only, no handlers, imports or remote resources.
            const clone = this.diagram.cloneNode(true), source = [this.diagram, ...this.diagram.querySelectorAll('*')], copies = [clone, ...clone.querySelectorAll('*')];
            const properties = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'font-family', 'font-size', 'font-weight', 'opacity', 'fill-rule', 'paint-order'];
            source.forEach((node, i) => { const style = getComputedStyle(node), copy = copies[i]; for (const name of properties)
                copy.style.setProperty(name, style.getPropertyValue(name)); copy.removeAttribute('tabindex'); copy.removeAttribute('role'); copy.removeAttribute('aria-pressed'); });
            const bounds = this.diagram.viewBox.baseVal, background = getComputedStyle(this.view.host).getPropertyValue('--ad-panel').trim() || '#fff';
            clone.prepend(svg('rect', { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, fill: background }));
            clone.setAttribute('xmlns', NS);
            clone.setAttribute('role', 'img');
            const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' })), link = el('a');
            link.href = url;
            link.download = this.view.title.replace(/[^\w-]/g, '-') + '-analysis.svg';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        saveState() { return { ...this.state, height: this.height }; }
        restore(state, restoreLayout = true) {
            if (!state || this.disposed) return;
            if (['distribution', 'histogram', 'matrix', 'relationships', 'gallery', 'bytes'].includes(state.kind)) this.state.kind = state.kind;
            if (['all', 'roots', 'leaves'].includes(state.scope)) this.state.scope = state.scope;
            if (typeof state.section === 'string') this.state.section = state.section;
            for (const key of ['group', 'measure', 'x', 'y']) {
                if (Number.isInteger(state[key]) && state[key] >= (key === 'measure' ? -1 : 0) && state[key] < this.view.columns.length)
                    this.state[key] = state[key];
            }
            for (const key of ['kind', 'group', 'measure', 'x', 'y', 'scope']) this[key].value = String(this.state[key]);
            if (Number.isFinite(state.height)) this.resizeHeight(state.height);
            const layout = ['auto', 'split', 'data', 'visual'].includes(state.layout) ? state.layout : 'auto';
            if (restoreLayout) this.setLayout(layout);
            else { this.state.layout = layout; this.layout(); }
            this.schedule();
        }
        dispose() { if (this.disposed)
            return; this.disposed = true; cancelAnimationFrame(this.frame); this.observer.disconnect(); this.host.remove(); this.grip.remove(); this.filterBar.remove(); this.toggle.remove(); this.chartData = []; this.chartRows = []; this.relationRows = []; this.diagram = null; this.body.replaceChildren(); this.footer.replaceChildren(); this.tools.replaceChildren(); this.view = null; this.drag = null; }
    }
    AnalysisVisuals.sequence = 0;
    return AnalysisVisuals;
}
