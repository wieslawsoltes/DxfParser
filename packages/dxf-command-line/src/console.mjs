import { CommandSession } from './session.mjs';
import { positiveInteger } from './parser.mjs';

// Share ownership/ID allocation across factories targeting the same document.
const identities = new WeakMap();
export function createCommandConsole({ window } = {}) {
    const document = window?.document;
    if (!document?.createElement || typeof window.AbortController !== 'function') throw new TypeError('A browser window is required.');
    let owner = identities.get(document);
    if (!owner) { owner = { sequence: 0, reserved: new Set() }; identities.set(document, owner); }
    const element = (tag, className = '', text = '') => {
        const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
    };
    return class CommandConsole {
        constructor({ inputId, label = 'Command:', title = 'Command history', placeholder = 'Enter a command',
            maxLines = 150, maxOutputLength = 8192, onError, ...sessionOptions } = {}) {
            this.maxLines = positiveInteger(maxLines, 'maxLines');
            this.maxOutputLength = positiveInteger(maxOutputLength, 'maxOutputLength');
            if (onError != null && typeof onError !== 'function') throw new TypeError('onError must be a function.');
            if (inputId != null && (typeof inputId !== 'string' || !inputId || /\s/.test(inputId))) throw new TypeError('inputId must be a nonempty HTML identifier.');
            if (inputId && (owner.reserved.has(inputId) || document.getElementById(inputId))) throw new Error('Command input ID is already owned.');
            if (!inputId) do { inputId = `dxf-command-${++owner.sequence}`; } while (owner.reserved.has(inputId) || document.getElementById(inputId));
            this.session = new CommandSession(sessionOptions);
            this.disposed = false;
            this.abort = new window.AbortController();
            this.node = element('section', 'dxf-command-console');
            this.log = element('div', 'dxf-command-log');
            this.log.setAttribute('role', 'log'); this.log.setAttribute('aria-label', title);
            this.log.setAttribute('aria-live', 'polite'); this.log.setAttribute('aria-relevant', 'additions text');
            this.form = element('form', 'dxf-command-form');
            const caption = element('label', '', label);
            this.input = element('input'); this.input.id = inputId; caption.htmlFor = inputId;
            this.input.autocomplete = 'off'; this.input.spellcheck = false; this.input.placeholder = placeholder;
            this.input.maxLength = this.session.maxLength;
            this.runButton = element('button', '', 'Run'); this.runButton.type = 'submit';
            this.status = element('span', 'dxf-command-status'); this.status.setAttribute('role', 'status');
            this.status.hidden = true;
            this.form.append(caption, this.input, this.runButton, this.status); this.node.append(this.log, this.form);
            this.onError = onError;
            owner.reserved.add(inputId);
            this.detach = this.session.subscribe(event => {
                if (event.type === 'submitted') this.append('> ' + event.request.text);
                else if (event.type === 'output') { this.append(event.message, event.error); if (event.error) this.onError?.(event.message); }
                else {
                    this.node.setAttribute('aria-busy', String(event.pending > 0));
                    this.status.hidden = event.pending === 0;
                    this.status.textContent = event.pending ? `${event.pending} pending` : '';
                }
            });
            const options = { signal: this.abort.signal };
            this.form.addEventListener('submit', event => {
                event.preventDefault(); const text = this.input.value; this.input.value = ''; void this.execute(text);
            }, options);
            this.input.addEventListener('keydown', event => {
                event.stopPropagation();
                if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    event.preventDefault();
                    this.input.value = event.key === 'ArrowUp' ? this.session.history.previous(this.input.value) : this.session.history.next(this.input.value);
                    this.input.setSelectionRange(this.input.value.length, this.input.value.length);
                } else if (event.key === 'Escape') {
                    event.preventDefault(); this.input.value = ''; this.session.history.reset();
                }
            }, options);
            this.input.addEventListener('input', () => this.session.history.reset(), options);
        }
        append(message, error = false) {
            if (this.disposed) return;
            const following = this.log.scrollHeight - this.log.clientHeight - this.log.scrollTop <= 8;
            const line = element('div', error ? 'dxf-command-error' : '', String(message).slice(0, this.maxOutputLength));
            this.log.append(line);
            while (this.log.children.length > this.maxLines) this.log.firstChild.remove();
            if (following) this.log.scrollTop = this.log.scrollHeight;
        }
        write(message, error = false) { this.session.write(message, error); }
        execute(text) { return this.session.submit(text); }
        focus() { if (!this.disposed) this.input.focus(); }
        dispose() {
            if (this.disposed) return;
            this.disposed = true; this.detach(); this.abort.abort(); this.session.dispose();
            this.onError = null; this.input.disabled = this.runButton.disabled = true;
            this.node.setAttribute('aria-busy', 'false'); this.status.hidden = true;
            this.node.remove(); this.log.replaceChildren(); owner.reserved.delete(this.input.id);
        }
    };
}
