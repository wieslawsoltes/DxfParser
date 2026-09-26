/** Parse a single command without executing expressions or interpreting paths. */
export function parseCommand(text, { maxLength = 2048, maxArguments = 64 } = {}) {
    positiveInteger(maxLength, 'maxLength');
    positiveInteger(maxArguments, 'maxArguments');
    if (typeof text !== 'string') throw new TypeError('Command text must be a string.');
    if (text.length > maxLength) throw new RangeError('Command length limit exceeded.');
    if (/[\r\n\0]/.test(text)) throw new SyntaxError('Commands must occupy one line without NUL characters.');
    text = text.trim();
    if (!text) return null;

    const tokens = [];
    let token = '', quote = '', started = false;
    const push = () => {
        if (!started) return;
        if (tokens.length > maxArguments) throw new RangeError('Command argument limit exceeded.');
        tokens.push(token); token = ''; started = false;
    };
    for (const char of text) {
        if (quote) {
            if (char === quote) quote = '';
            else token += char;
        } else if (char === '"' || char === "'") {
            quote = char; started = true;
        } else if (/\s/u.test(char)) {
            push();
        } else {
            token += char; started = true;
        }
    }
    if (quote) throw new SyntaxError('Unterminated quoted argument.');
    push();
    if (!tokens[0]) throw new SyntaxError('A command name is required.');
    return Object.freeze({ text, command: tokens[0].toUpperCase(), args: Object.freeze(tokens.slice(1)) });
}

export function positiveInteger(value, name) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive safe integer.`);
    return value;
}

export function errorMessage(error) {
    try { return String(error?.message ?? error ?? 'Command failed.'); }
    catch { return 'Command failed.'; }
}
