import { parseCommand, positiveInteger, errorMessage } from './parser.mjs';
import { CommandHistory } from './history.mjs';

/** Serial host-command execution. Cancellation settles callers, not arbitrary host side effects. */
export class CommandSession {
    #execute;
    #onObserverError;
    #listeners = new Set();
    #queue = [];
    #active = null;
    #disposed = false;
    #options;

    constructor({ execute, onObserverError, historyLimit = 100, maxPending = 32,
        maxLength = 2048, maxArguments = 64 } = {}) {
        if (typeof execute !== 'function') throw new TypeError('An execute callback is required.');
        if (onObserverError != null && typeof onObserverError !== 'function') throw new TypeError('onObserverError must be a function.');
        this.#execute = execute;
        this.#onObserverError = onObserverError;
        this.#options = Object.freeze({
            maxPending: positiveInteger(maxPending, 'maxPending'),
            maxLength: positiveInteger(maxLength, 'maxLength'),
            maxArguments: positiveInteger(maxArguments, 'maxArguments')
        });
        this.history = new CommandHistory(historyLimit);
    }
    get disposed() { return this.#disposed; }
    get pending() { return this.#queue.length + (this.#active ? 1 : 0); }
    get maxLength() { return this.#options.maxLength; }
    subscribe(listener) {
        if (this.#disposed) throw new Error('Command session is disposed.');
        if (typeof listener !== 'function') throw new TypeError('A command event listener is required.');
        const subscription = { listener };
        this.#listeners.add(subscription);
        return () => this.#listeners.delete(subscription);
    }
    #emit(event) {
        Object.freeze(event);
        for (const entry of [...this.#listeners]) {
            if (!this.#listeners.has(entry)) continue;
            try { entry.listener(event); }
            catch (error) { try { this.#onObserverError?.(error); } catch { /* Host diagnostics are isolated. */ } }
        }
    }
    #state() { this.#emit({ type: 'state', pending: this.pending, disposed: this.#disposed }); }
    write(message, error = false) {
        if (!this.#disposed) this.#emit({ type: 'output', message: errorMessage(message), error: !!error });
    }
    submit(text) {
        if (this.#disposed) return Promise.resolve({ status: 'cancelled' });
        let request;
        try {
            request = parseCommand(text, this.#options);
            if (!request) return Promise.resolve({ status: 'empty' });
            if (this.pending >= this.#options.maxPending) throw new RangeError('Command queue capacity exceeded.');
        } catch (error) {
            this.write(errorMessage(error), true);
            return Promise.resolve({ status: 'error', error });
        }
        const job = { request, controller: new AbortController(), settled: false };
        const promise = new Promise(resolve => { job.resolve = resolve; });
        this.#queue.push(job);
        this.history.push(request.text);
        this.#emit({ type: 'submitted', request });
        this.#state();
        // The job is already owned by the queue, even if an observer disposes the session.
        this.#drain();
        return promise;
    }
    #settle(job, result) {
        if (job.settled) return;
        job.settled = true;
        job.resolve(Object.freeze(result));
    }
    #drain() {
        if (this.#disposed || this.#active || !this.#queue.length) return;
        const job = this.#active = this.#queue.shift();
        const execute = this.#execute;
        Promise.resolve().then(async () => {
            if (job.settled || this.#disposed) return;
            const context = Object.freeze({ ...job.request, signal: job.controller.signal,
                write: (message, error = false) => { if (!job.settled) this.write(message, error); } });
            try {
                const value = await execute(context);
                if (!job.settled) this.#settle(job, { status: 'ok', value });
            } catch (error) {
                if (!job.settled) {
                    this.write(errorMessage(error), true);
                    this.#settle(job, { status: 'error', error });
                }
            } finally {
                if (this.#active === job) {
                    this.#active = null;
                    this.#state();
                    this.#drain();
                }
            }
        });
    }
    dispose() {
        if (this.#disposed) return;
        this.#disposed = true;
        const jobs = [...(this.#active ? [this.#active] : []), ...this.#queue];
        this.#active = null; this.#queue.length = 0;
        for (const job of jobs) {
            this.#settle(job, { status: 'cancelled' });
            job.controller.abort();
        }
        this.#state();
        this.#listeners.clear(); this.history.clear();
        this.#execute = this.#onObserverError = null;
    }
}
