/** Retained controls in a top-layer disclosure, scoped to the host browser realm.
 * Native popovers escape dock overflow clips. Older hosts use a bounded inline
 * disclosure instead; neither path reparents controls or recreates view state. */
const sequences = new WeakMap();

export function createControlMenu(win, { label, text = label, className = '' } = {}) {
    const doc = win?.document;
    if (!doc || typeof label !== 'string' || !label.trim())
        throw new TypeError('A control menu requires a browser window and accessible label.');
    const abort = new win.AbortController(), options = { signal: abort.signal };
    let serial = sequences.get(doc) || 0, id;
    do { id = `analysis-controls-${++serial}`; } while (doc.getElementById(id));
    sequences.set(doc, serial);
    const root = doc.createElement('div'); root.className = 'analysis-control-menu ' + className;
    const trigger = doc.createElement('button'); trigger.type = 'button'; trigger.textContent = text;
    trigger.setAttribute('aria-label', label); trigger.setAttribute('aria-controls', id);
    trigger.setAttribute('aria-expanded', 'false'); trigger.title = label;
    const panel = doc.createElement('section'); panel.id = id; panel.className = 'analysis-control-panel';
    panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', label); panel.hidden = true;
    const heading = doc.createElement('div'); heading.className = 'analysis-control-heading';
    const title = doc.createElement('strong'); title.textContent = label;
    const close = doc.createElement('button'); close.type = 'button'; close.textContent = 'Close';
    close.setAttribute('aria-label', 'Close ' + label.toLowerCase());
    const content = doc.createElement('div'); content.className = 'analysis-control-content';
    heading.append(title, close); panel.append(heading, content); root.append(trigger, panel);
    const native = typeof panel.showPopover === 'function' && 'popoverTargetElement' in trigger;
    let disposed = false, open = false, frame = 0;
    function position() {
        frame = 0;
        if (disposed || !open) return;
        const rect = trigger.getBoundingClientRect(), viewport = win.visualViewport;
        const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
        const width = viewport?.width || doc.documentElement.clientWidth;
        const height = viewport?.height || doc.documentElement.clientHeight;
        if (!trigger.isConnected || rect.width <= 0 || rect.height <= 0 || rect.bottom < top || rect.top > top + height) {
            hide(false); return;
        }
        if (!native) return;
        const gap = 6, margin = 8, panelWidth = Math.max(0, Math.min(400, width - 2 * margin));
        // Use the larger available side; scrolling is inside the disclosure, not
        // inside a clipped toolbar or a second report-sized region.
        const below = Math.max(0, top + height - margin - rect.bottom - gap);
        const above = Math.max(0, rect.top - gap - top - margin);
        const down = below >= Math.min(300, above);
        Object.assign(panel.style, {
            width: panelWidth + 'px', maxHeight: Math.max(0, down ? below : above) + 'px',
            left: Math.max(left + margin, Math.min(rect.right - panelWidth, left + width - margin - panelWidth)) + 'px',
            top: down ? rect.bottom + gap + 'px' : 'auto',
            bottom: down ? 'auto' : Math.max(0, win.innerHeight - rect.top + gap) + 'px'
        });
    }
    function schedule() {
        if (!disposed && open && !frame) frame = win.requestAnimationFrame(position);
    }
    function state(value) {
        open = value; trigger.setAttribute('aria-expanded', String(value));
        root.classList.toggle('is-open', value);
        if (value) schedule();
        else if (frame) { win.cancelAnimationFrame(frame); frame = 0; }
    }
    function show() {
        if (disposed || open || !trigger.isConnected) return;
        panel.hidden = false;
        if (native) panel.showPopover(); else state(true);
        position();
    }
    function hide(restoreFocus = false) {
        if (!open) return;
        if (native) panel.hidePopover(); else { panel.hidden = true; state(false); }
        if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
    }
    if (native) {
        panel.popover = 'auto'; trigger.popoverTargetElement = panel;
        trigger.popoverTargetAction = 'toggle';
        // Keep native keyboard/light-dismiss semantics and focus order. hidden is
        // not used by the top-layer path after setup; the popover state owns it.
        panel.hidden = false;
        panel.addEventListener('beforetoggle', e => { state(e.newState === 'open'); if (open) position(); }, options);
    } else {
        root.classList.add('analysis-control-inline');
        trigger.addEventListener('click', () => open ? hide() : show(), options);
        doc.addEventListener('pointerdown', e => { if (open && !e.composedPath().includes(root)) hide(); }, options);
    }
    close.addEventListener('click', () => hide(true), options);
    panel.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(true); }
    }, options);
    // Native light-dismiss restores focus on Escape; do not steal it on outside
    // pointer dismissal. All listeners and observers share the owner's lifetime.
    win.addEventListener('resize', schedule, options);
    doc.addEventListener('scroll', schedule, { ...options, capture: true });
    win.visualViewport?.addEventListener('resize', schedule, options);
    win.visualViewport?.addEventListener('scroll', schedule, options);
    const observer = new win.ResizeObserver(schedule); observer.observe(trigger);
    return {
        root, trigger, panel, content, show, hide,
        dispose() {
            if (disposed) return;
            hide(false); disposed = true; abort.abort(); observer.disconnect();
            if (frame) win.cancelAnimationFrame(frame);
            if (native) trigger.popoverTargetElement = null;
            root.remove();
        }
    };
}
