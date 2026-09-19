/** JSON-safe event forwarding for Blazor / Microsoft.JSInterop hosts. */
function safeValue(value, seen = new WeakSet(), depth = 0) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'object' || depth > 6 || seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.slice(0, 256).map((item) => safeValue(item, seen, depth + 1) ?? null);
    seen.delete(value);
    return result;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    return undefined;
  const result = Object.create(null);
  for (const key of Object.keys(value).slice(0, 256)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    // Event serialization must not invoke getters supplied by application data.
    if (!descriptor || !('value' in descriptor)) continue;
    const child = safeValue(descriptor.value, seen, depth + 1);
    if (child !== undefined) result[key] = child;
  }
  seen.delete(value);
  return result;
}

/**
 * Forward ribbon-command, ribbon-change, and ribbon-tab-change to .NET.
 * The host owns the DotNetObjectReference lifetime. Dispose the bridge first.
 */
export function createDotNetBridge(ribbon, dotNetObject, options = {}) {
  if (!ribbon || typeof ribbon.addEventListener !== 'function')
    throw new TypeError('A RibbonWeb element is required.');
  if (!dotNetObject || typeof dotNetObject.invokeMethodAsync !== 'function')
    throw new TypeError('A DotNetObjectReference is required.');
  const methodName = options.methodName ?? 'OnRibbonEvent';
  if (typeof methodName !== 'string' || !methodName)
    throw new TypeError('methodName must be a non-empty string.');
  let disposed = false;
  let pending = Promise.resolve();
  const eventTypes = ['ribbon-command', 'ribbon-change', 'ribbon-tab-change'];
  function forward(event) {
    if (disposed) return;
    const detail = event.detail || {};
    const payload = { type: event.type, id: typeof detail.id === 'string' ? detail.id : '' };
    for (const key of ['value', 'parameter']) {
      if (!Object.prototype.hasOwnProperty.call(detail, key)) continue;
      const value = safeValue(detail[key]);
      if (value !== undefined) payload[key] = value;
    }
    // Maintain the same order for asynchronous .NET handlers as DOM dispatch order.
    pending = pending.then(async () => {
      if (disposed) return;
      try {
        await dotNetObject.invokeMethodAsync(methodName, payload);
      } catch (error) {
        if (disposed) return;
        if (typeof options.onError === 'function') options.onError(error, payload);
        else if (typeof CustomEvent === 'function')
          ribbon.dispatchEvent(
            new CustomEvent('ribbon-dotnet-error', {
              detail: { error, event: payload },
              bubbles: true,
              composed: true,
            }),
          );
      }
    });
  }
  for (const type of eventTypes) ribbon.addEventListener(type, forward);
  function assertActive() {
    if (disposed) throw new Error('This .NET ribbon bridge has been disposed.');
  }
  return {
    setModel(model) {
      assertActive();
      ribbon.model = model;
    },
    setDataContext(dataContext) {
      assertActive();
      ribbon.dataContext = dataContext;
    },
    updateControl(id, changes) {
      assertActive();
      return ribbon.updateControl(id, changes);
    },
    setContext(name, active) {
      assertActive();
      return ribbon.setContext(name, !!active);
    },
    selectTab(id) {
      assertActive();
      return ribbon.selectTab(id);
    },
    async flush() {
      await pending;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const type of eventTypes) ribbon.removeEventListener(type, forward);
    },
  };
}
