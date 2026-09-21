# Atomic workspace startup

Both `index.html` and `editor/index.html` contain legacy DOM retained as command
and panel sources for the controllers. Previously that markup was paintable while
RibbonWeb's ES module graph was loading. The editor also deferred its classic
scripts, leaving its original ribbon visible until DOMContentLoaded. A settled
workspace screenshot could not detect this refresh-only flash.

## First-paint contract

The document starts with `data-workspace-state="loading"`. Critical styles are
inline in the head **before any external resource**, in both entry points. They
hide all body subtrees except the startup status, including explicitly visible
legacy descendants. The application root is inert and hidden from accessibility
until ready. Visibility/opacity, not `display:none`, preserve real layout boxes
for RibbonWeb and Dockyard sizing. These styles remain effective when dependency
requests fail or JavaScript is disabled.

`scripts/workspace-startup.js` reads the saved Dockyard theme before body paint,
without changing storage or failing when it is unavailable/corrupt. It observes
startup dependency errors, uncaught exceptions and unhandled rejections without
suppressing browser diagnostics. An unavailable startup script has a static error
fallback; disabled JavaScript has an explicit noscript message. A native reload
link remains usable without any scripting. No recovery path clears saved data.

The parser and editor entry points signal `complete(workspace)` only after their
controllers, saved document identities, dock layout and real RibbonWeb are mounted.
The coordinator then gives their scheduled renders and resize callbacks two
animation-frame opportunities while keeping the layout hidden but measurable.
It checks the connected ribbon's actual shadow content and nonzero dock/ribbon
sizes before a single state transition to `ready`. That transition removes the
startup status and releases the application root together. No fixed timeout,
fade, low-quality renderer mode or delayed GPU initialization workaround is used.

Errors before readiness are terminal for that startup attempt: show an actionable
status instead of falling back to old or partially mounted UI. Startup listeners
are removed after success; normal runtime errors and back/forward-cache lifecycle
events do not hide a working application. Native rendering initialization remains
independent and continues to use its existing diagnostics and recovery behavior.

## Regression testing

Run `python tests/workspace-startup.py`. The suite serves the real application
through HTTP with native modules and real browser storage. It holds RibbonWeb
requests while the retained markup is parsed, samples visibility on animation
frames from document creation, checks focus exclusion and nonzero sizing, and
then releases the requests. Cold parser/editor loads, refresh with saved drawing
and dark/high-contrast themes, delayed/missing CSS, failed modules/constructors,
missing startup script, disabled JavaScript, corrupt storage and post-ready
lifecycle behavior are covered. Pending/ready screenshots and frame observations
are uploaded by `.github/workflows/workspace-startup.yml`. Pending screenshots use
Chromium's compositor capture directly: Playwright's normal screenshot waits for
font readiness, which cannot settle while a deliberately held module delays
DOMContentLoaded. Requests are resumed before removing their handlers, even after
failed assertions. No-JavaScript checks inspect the rendered noscript paragraph
instead of text selectors that exclude noscript content. These harness fixes do
not remove or relax the first-paint, focus, restoration or failure assertions.

The injected/offline harness is explicitly rejected by this suite: testing an
already constructed document cannot qualify network-dependent first-paint order.
Existing docking/ribbon/analysis/CAD tests remain independent regression checks.

Browser contracts: [HTML inert subtrees](https://html.spec.whatwg.org/multipage/interaction.html#inert-subtrees)
and [animation-frame callbacks](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames).
