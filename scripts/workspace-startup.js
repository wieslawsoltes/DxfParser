/* The HTML first-paint gate is active before any dependency loads. Keep it closed
 * until the actual ribbon, restored dock layout and their initial sizing exist. */
(function (global) {
  'use strict';
  const root = document.documentElement;
  if (!root.hasAttribute('data-workspace-state')) return; // Embedded library consumers.
  const lifetime = new AbortController();
  let completing = false;
  let error = null;
  let frames = [];

  // Match the saved Dockyard theme before the first body paint. Storage can be
  // disabled or corrupt: neither is fatal, nor a reason to erase the user's data.
  try {
    const value = localStorage.getItem(`dxfparser.dockyard.${root.dataset.workspaceKind}.v1`);
    const saved = value && value.length <= 1024 * 1024 ? JSON.parse(value) : null;
    if (['light', 'dark', 'contrast'].includes(saved?.theme)) root.dataset.startupTheme = saved.theme;
  } catch (_) { /* Use the entry point's default theme. */ }

  function showError() {
    const status = document.getElementById('workspaceStartup');
    if (!status || !error) return;
    status.setAttribute('role', 'alert');
    status.setAttribute('aria-live', 'assertive');
    const detail = status.querySelector('[data-startup-detail]');
    detail.textContent = error;
    detail.hidden = false;
  }

  function fail(reason) {
    if (root.dataset.workspaceState === 'ready' || error) return;
    error = String(reason?.message || reason || 'Workspace initialization failed.');
    root.dataset.workspaceState = 'error';
    for (const frame of frames) cancelAnimationFrame(frame);
    frames = [];
    showError();
    // An early script or stylesheet can fail before the status markup is parsed.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showError, { once: true, signal: lifetime.signal });
    }
  }

  function onError(event) {
    const target = event.target;
    if (target?.tagName === 'SCRIPT' || target?.tagName === 'LINK' && target.rel === 'stylesheet') {
      const path = new URL(target.src || target.href, document.baseURI).pathname;
      fail(`Could not load workspace dependency: ${path}`);
    } else if (event.error || event.message) {
      fail(event.error || event.message);
    }
    // Do not suppress console errors, browser diagnostics or application handlers.
  }
  global.addEventListener('error', onError, { capture: true, signal: lifetime.signal });
  global.addEventListener('unhandledrejection', event => fail(event.reason), { signal: lifetime.signal });

  function complete(workspace) {
    if (completing || error || root.dataset.workspaceState === 'ready') return;
    completing = true;
    const shell = document.querySelector('[data-startup-root]');
    const ribbon = workspace?.ribbonElement;
    if (!workspace?.ready || !workspace.host?.isConnected || !shell || !ribbon?.isConnected) {
      fail('The ribbon and docking workspace did not initialize.');
      return;
    }
    root.dataset.workspaceState = 'settling';
    // These are layout opportunities, not a guessed loading delay. Hidden but
    // measurable content allows Dockyard and RibbonWeb to calculate real sizes.
    frames.push(requestAnimationFrame(() => {
      if (error) return;
      try {
        workspace.syncPresentation(false);
        workspace.scheduleResize();
        frames.push(requestAnimationFrame(() => {
          if (error) return;
          try {
            if (workspace.disposed || !ribbon.shadowRoot?.querySelector('[part="ribbon"]') ||
                workspace.host.clientWidth <= 0 || workspace.host.clientHeight <= 0 || ribbon.clientHeight <= 0) {
              throw new Error('The ribbon or dock layout could not be prepared for display.');
            }
            // A single state transition reveals the complete tree and hides the
            // status. No fade/cross-fade can expose the retained legacy controls.
            shell.removeAttribute('inert');
            shell.removeAttribute('aria-hidden');
            shell.removeAttribute('aria-busy');
            root.dataset.workspaceState = 'ready';
            frames = [];
            lifetime.abort();
            global.dispatchEvent(new CustomEvent('dxf-workspace-ready', { detail: { workspace: workspace.id } }));
          } catch (cause) { fail(cause); }
        }));
      } catch (cause) { fail(cause); }
    }));
  }

  global.DxfWorkspaceStartup = Object.freeze({ complete, fail, get error() { return error; } });
})(window);
