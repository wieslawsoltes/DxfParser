import { positiveInteger } from './parser.mjs';

/** Bounded per-session recall; the draft is restored when moving past the newest entry. */
export class CommandHistory {
    #limit;
    #entries = [];
    #index = 0;
    #draft = '';

    constructor(limit = 100) { this.#limit = positiveInteger(limit, 'historyLimit'); }
    get limit() { return this.#limit; }
    get entries() { return this.#entries.slice(); }
    get index() { return this.#index; }
    push(text) {
        if (typeof text !== 'string') throw new TypeError('History text must be a string.');
        if (text) {
            this.#entries.push(text);
            if (this.#entries.length > this.limit) this.#entries.splice(0, this.#entries.length - this.limit);
        }
        this.reset();
    }
    previous(draft = '') {
        if (this.#index === this.#entries.length) this.#draft = String(draft);
        if (this.#index > 0) this.#index--;
        return this.#entries[this.#index] ?? this.#draft;
    }
    next(draft = this.#draft) {
        if (this.#index === this.#entries.length) return String(draft);
        if (this.#index < this.#entries.length) this.#index++;
        return this.#entries[this.#index] ?? this.#draft;
    }
    reset() { this.#index = this.#entries.length; this.#draft = ''; }
    clear() { this.#entries.length = 0; this.reset(); }
}
