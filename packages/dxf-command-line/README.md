# @wieslawsoltes/dxf-command-line

A host-injected command console with strict argument parsing, bounded per-session
history and serial asynchronous execution. It does not implement CAD commands,
evaluate JavaScript, discover application services or import a renderer.

## Browser integration

Load `styles.css` and supply the browser window and command executor:

```js
import { createCommandConsole } from '@wieslawsoltes/dxf-command-line';
const Console = createCommandConsole({ window });
const terminal = new Console({
    execute: async ({ command, args, signal, write }) => {
        signal.throwIfAborted();
        if (command !== 'ECHO') throw new Error('Unknown command.');
        write(args.join(' '));
    },
    onError: message => showStatus(message)
});
document.getElementById('console').append(terminal.node);
await terminal.execute('ECHO "Main Pipes"');
// When the host removes the owner:
terminal.dispose();
```

Each console owns its session, event listeners, history and log. Generated input
IDs are unique across factories targeting the same document; explicit IDs are
reserved even while a console is detached. The log is text-only, capped at 150
lines and 8,192 characters per line by default. It follows new output only when
already scrolled to the end. Up/Down recall keeps the unsubmitted draft; Escape
clears the input without cancelling an executing command. Composition and modified
arrow keys are left to the input. Pending status and semantic labels remain usable
in narrow, docked hosts. Hosts own mounting, visibility and styles.

## DOM-free services

`parseCommand(text)` returns a frozen `{text, command, args}` record or null for
blank input. Names become uppercase; argument casing and backslashes are retained.
Single/double quotes group arguments, empty quoted arguments are preserved, and
adjacent quoted/unquoted segments concatenate. Use the other quote kind to include
a literal quote. Backslashes are path characters, not escape sequences. Unclosed
quotes, NULs, CR/LF, an empty command name, overlong input and excess arguments
reject before execution. Defaults are 2,048 UTF-16 code units and 64 arguments.

`CommandHistory` provides bounded recall and independent snapshots of its entries.
`CommandSession({execute})` accepts parsed host commands in submission order. Each
session runs at most one executor at a time, including across await boundaries,
with a default capacity of 32 active/queued requests. Invalid/over-capacity requests
never enter history. Executor failures do not poison later commands.

`submit` resolves a discriminated result with status `ok`, `error`, `empty` or
`cancelled`; command failures do not reject the promise. `subscribe` provides
submitted/output/state events and returns a detachable subscription. One observer
cannot interrupt another; optional `onObserverError` receives callback failures.

Disposal immediately cancels queued requests, resolves active callers as cancelled,
aborts the executor's signal, removes observers and releases history/host callbacks.
Late executor output and rejection are ignored. **Cancellation is cooperative:**
the package cannot roll back side effects or forcibly stop an arbitrary host
promise. Executors must check the supplied signal after awaits and before further
mutations. A session must not await a command submitted to itself: serial execution
would wait for the active command. Separate owners should use separate sessions.

## Packaging

ESM is canonical; Node 22.13+ CommonJS consumers load the identical exports through
`index.cjs`. Imports are DOM-free and install no globals. There are no runtime
package dependencies, generated distributions or bundled fonts. TypeScript
contracts, CSS and an MIT license are included. No build is needed:

```sh
npm pack ./packages/dxf-command-line
```

Packing creates a tarball; it does not publish to npm. The DxfParser adapter keeps
CAD dispatch, resources, docking, native rendering and file lifetimes outside this
package.

## License

[MIT](LICENSE).
