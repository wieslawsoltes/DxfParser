/** Bind the property inspector to one browser realm and an optional host record-view factory. */
export function createPropertyInspector({ window, createRecordView } = {}) {
    if (!window?.document?.createElement || !window.HTMLElement)
        throw new TypeError('A browser window is required.');
    if (createRecordView != null && typeof createRecordView !== 'function')
        throw new TypeError('createRecordView must be a function.');
    const document = window.document;
    const valueOf = property => {
        const value = property.value == null ? '' : String(property.value);
        // Compatibility with old section providers, without ever executing markup.
        return property.isHtml ? value.replace(/<[^>]*>/g, '') : value;
    };
    const element = (tag, className, value) => {
        const node = document.createElement(tag);
        node.className = className;
        if (value != null) node.textContent = String(value);
        return node;
    };
    const owners = new WeakMap();

    return class RenderingPropertyGrid {
        constructor(container, options = {}) {
            if (!(container instanceof window.HTMLElement) || container.ownerDocument !== document)
                throw new TypeError('Property inspector container must belong to the supplied window.');
            if (owners.has(container)) throw new Error('Property inspector container is already owned.');
            this.container = container;
            this.options = { emptyMessage: 'No properties available.', title: 'Selection Properties', ...options };
            this.sections = [];
            this.disposed = false;
            this.hadClass = container.classList.contains('rendering-property-grid');
            container.classList.add('rendering-property-grid');
            owners.set(container, this);
        }

        assertAlive() { if (this.disposed) throw new Error('Property inspector is disposed.'); }

        setSections(sections) {
            this.assertAlive();
            const next = Array.isArray(sections) ? sections.map(section => ({
                title: typeof section?.title === 'string' ? section.title : '',
                subtitle: typeof section?.subtitle === 'string' ? section.subtitle : '',
                properties: Array.isArray(section?.properties) ? section.properties.filter(p => p && typeof p === 'object').map(p => ({ ...p })) : []
            })) : [];
            this.sections = next;
            this.render();
        }

        clear() { this.setSections([]); }

        render() {
            this.assertAlive();
            if (createRecordView) {
                const rows = this.sections.flatMap((section, index) => section.properties.map((property, i) => ({
                    key: `${index}:${i}`, values: [section.title, property.name, property.isHtml ? valueOf(property) : property.value]
                })));
                if (this.gridView) this.gridView.setRows(rows);
                else {
                    this.container.replaceChildren();
                    this.gridView = createRecordView(this.container, {
                        title: this.options.title, columns: ['Section', 'Property', 'Value'], rows
                    });
                    if (!this.gridView || typeof this.gridView.setRows !== 'function' || typeof this.gridView.dispose !== 'function')
                        throw new TypeError('Record view must implement setRows and dispose.');
                    if (this.theme != null) this.gridView.setTheme?.(this.theme);
                }
                return;
            }
            const fragment = document.createDocumentFragment();
            if (!this.sections.length) {
                const empty = element('div', 'property-grid-empty', this.options.emptyMessage);
                empty.setAttribute('role', 'status');
                fragment.append(empty);
            }
            for (const section of this.sections) {
                const card = element('section', 'property-grid-section');
                if (section.title) card.append(element('h4', 'property-grid-title', section.title));
                if (section.subtitle) card.append(element('div', 'property-grid-subtitle', section.subtitle));
                const table = element('table', 'property-grid-table');
                table.setAttribute('aria-label', section.title || this.options.title);
                const body = document.createElement('tbody');
                const properties = section.properties.length ? section.properties : [{ name: 'Details', value: 'No properties provided.' }];
                for (const property of properties) {
                    const row = element('tr', 'property-grid-row');
                    const key = element('th', 'property-grid-key', property.name ?? '');
                    key.scope = 'row';
                    const value = element('td', 'property-grid-value');
                    value.append(element('pre', '', valueOf(property)));
                    row.append(key, value);
                    body.append(row);
                }
                table.append(body);
                card.append(table);
                fragment.append(card);
            }
            this.container.replaceChildren(fragment);
        }

        setTheme(theme) {
            this.assertAlive();
            this.theme = String(theme);
            this.container.dataset.propertyTheme = this.theme;
            this.gridView?.setTheme?.(this.theme);
        }

        dispose() {
            if (this.disposed) return;
            this.disposed = true;
            const container = this.container;
            try { this.gridView?.dispose(); }
            finally {
                this.gridView = null;
                this.sections = [];
                owners.delete(container);
                if (!this.hadClass) container.classList.remove('rendering-property-grid');
                delete container.dataset.propertyTheme;
                container.replaceChildren();
                this.container = null;
            }
        }
    };
}
