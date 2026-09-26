export interface ParsedCommand {
    readonly text: string;
    readonly command: string;
    readonly args: readonly string[];
}
export interface ParseOptions { maxLength?: number; maxArguments?: number; }
export function parseCommand(text: string, options?: ParseOptions): ParsedCommand | null;
export class CommandHistory {
    constructor(limit?: number);
    readonly limit: number;
    readonly entries: string[];
    readonly index: number;
    push(text: string): void;
    previous(draft?: string): string;
    next(draft?: string): string;
    reset(): void;
    clear(): void;
}
export interface CommandContext extends ParsedCommand {
    readonly signal: AbortSignal;
    write(message: unknown, error?: boolean): void;
}
export type CommandResult<T = unknown> =
    | { readonly status: 'ok'; readonly value: T }
    | { readonly status: 'error'; readonly error: unknown }
    | { readonly status: 'cancelled' | 'empty' };
export type CommandEvent =
    | { readonly type: 'submitted'; readonly request: ParsedCommand }
    | { readonly type: 'output'; readonly message: string; readonly error: boolean }
    | { readonly type: 'state'; readonly pending: number; readonly disposed: boolean };
export interface SessionOptions<T = unknown> extends ParseOptions {
    execute(context: CommandContext): T | Promise<T>;
    onObserverError?(error: unknown): void;
    historyLimit?: number;
    maxPending?: number;
}
export class CommandSession<T = unknown> {
    constructor(options: SessionOptions<T>);
    readonly history: CommandHistory;
    readonly disposed: boolean;
    readonly pending: number;
    readonly maxLength: number;
    subscribe(listener: (event: CommandEvent) => void): () => boolean;
    write(message: unknown, error?: boolean): void;
    submit(text: string): Promise<CommandResult<T>>;
    dispose(): void;
}
export interface ConsoleOptions<T = unknown> extends SessionOptions<T> {
    inputId?: string;
    label?: string;
    title?: string;
    placeholder?: string;
    maxLines?: number;
    maxOutputLength?: number;
    onError?(message: string): void;
}
export interface CommandConsole<T = unknown> {
    readonly node: HTMLElement;
    readonly log: HTMLDivElement;
    readonly form: HTMLFormElement;
    readonly input: HTMLInputElement;
    readonly runButton: HTMLButtonElement;
    readonly session: CommandSession<T>;
    readonly disposed: boolean;
    write(message: unknown, error?: boolean): void;
    execute(text: string): Promise<CommandResult<T>>;
    focus(): void;
    dispose(): void;
}
export function createCommandConsole(options: { window: Window & typeof globalThis }): {
    new <T = unknown>(options: ConsoleOptions<T>): CommandConsole<T>;
};
