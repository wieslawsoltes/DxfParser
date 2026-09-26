/** Bounded, frame-coalesced rows. Scheduling is injected so the model is DOM-free. */
export class ReportBuffer {
    constructor({ publish, schedule, cancel, onError = () => {}, maxRows = 250000 } = {}) {
        if ([publish, schedule, cancel, onError].some(callback => typeof callback !== 'function'))
            throw new TypeError('ReportBuffer requires publish, schedule and cancel functions.');
        if (!Number.isSafeInteger(maxRows) || maxRows < 1)
            throw new RangeError('maxRows must be a positive safe integer.');
        this.publish = publish;
        this.schedule = schedule;
        this.cancel = cancel;
        this.onError = onError;
        this.maxRows = maxRows;
        this.items = [];
        this.pending = null;
        this.dirty = false;
        this.disposed = false;
    }

    get count() { return this.items.length; }
    snapshot() { return this.items.slice(); }

    append(row) { return this.appendMany([row]); }

    appendMany(rows) {
        this.assertActive();
        if (!Array.isArray(rows)) throw new TypeError('Report rows must be an array.');
        if (rows.length > this.maxRows - this.items.length)
            throw new RangeError(`A report is limited to ${this.maxRows.toLocaleString()} rows.`);
        // Do not spread large inputs into push: that can exhaust the argument stack.
        const appended = rows.slice();
        for (const row of appended) this.items.push(row);
        if (rows.length) this.queue();
        return this.count;
    }

    replace(rows) {
        this.assertActive();
        if (!Array.isArray(rows)) throw new TypeError('Report rows must be an array.');
        if (rows.length > this.maxRows) throw new RangeError('Report row limit exceeded.');
        this.items = rows.slice();
        this.queue();
    }

    assertActive() {
        if (this.disposed) throw new Error('ReportBuffer is disposed.');
    }

    queue() {
        this.dirty = true;
        if (this.pending !== null) return;
        // The host scheduler must invoke asynchronously, as requestAnimationFrame does.
        this.pending = this.schedule(() => {
            this.pending = null;
            if (this.disposed) return;
            try { this.flush(); }
            catch (error) { try { this.onError?.(error); } catch (_) {} }
        });
    }

    flush() {
        if (this.disposed) return;
        if (this.pending !== null) { this.cancel(this.pending); this.pending = null; }
        if (!this.dirty) return;
        this.dirty = false;
        try { this.publish(this.snapshot()); }
        catch (error) {
            // Keep the data available for an explicit retry. Do not create an
            // infinite frame/retry loop when the consumer is broken.
            if (!this.disposed) this.dirty = true;
            throw error;
        }
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        if (this.pending !== null) this.cancel(this.pending);
        this.pending = null;
        this.items = [];
        this.dirty = false;
        this.publish = this.schedule = this.cancel = this.onError = null;
    }
}
