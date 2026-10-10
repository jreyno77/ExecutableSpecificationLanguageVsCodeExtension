import { CancellationError, workspace } from 'vscode';
import type { LanguageServerAdapter } from "./LanguageServerAdapter.js";
import type { ExtensionContext } from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";



/**
 * Unverified implementation obligation.
 * Requires package: language-client (runtime)
 * Requires package: vscode-types (build)
 * Requires package: typescript (build)
 * Requires package: vite (build)
 * Requires package: vitest (test)
 * Requires package: vscode-test-electron (test)
 * Depends on: LanguageServerAdapter
 */
export class EditorLanguageSupport {
    private readonly context: ExtensionContext;
    private readonly client: LanguageClient;
    private started = false;
    private disposed = false;
    private releaseMiddleware?: () => void;
    constructor(context: ExtensionContext, client: LanguageClient) {
        this.context = context;
        this.client = client;
    }
    /**
     * Unverified implementation obligation.
     * Request startup of the supplied native LanguageClient once. The native entry point owns its construction, packaged TypeScript server, expec selector (file and untitled), and single awaited stop on deactivation. Return that native client through the standard VS Code activation export for callers of its native feature APIs. Register owned resources with this extension context. Use native document diagnostic pull on edits. In the public provideDiagnostics middleware capture native document identity/version before awaiting next, then cancel an obsolete/closed result instead of returning empty success. The SDK owns scheduling, cancellation and diagnostic collections. Never replace newer feedback or reopen diagnostics for a closed document; do not rely on push version fields. Guard public provideDefinition middleware with the requesting native document identity/version around its await, preserving prior middleware. Cancel obsolete, closed, disposed or cancelled requests rather than returning an old target. For returned target URIs already open when the request began, also refuse a result if that captured target buffer changed or ended its lifetime while awaiting. Core reports establish point-in-time meaning; this does not promise editor/filesystem atomicity across the process boundary. Guard public provideHover middleware with requesting native document identity/version around its await, preserving prior middleware. Capture the requesting document and currently open expec buffer identities/versions before awaiting. After the prior middleware or next resolves, cancel if disposed, token-cancelled, or any captured buffer changed, closed or was replaced, since a hover reply does not identify its declaration source across the native boundary. Restore only this adapter's own middleware on disposal. This conservative pending-request guard does not claim filesystem/editor atomicity or replace core resolution policy. Keep startup failures observable and keep core policy out of this host adapter.
     * Guard standard provideDocumentSymbols middleware with the requesting native document identity/version around awaiting next. Preserve prior middleware and restore only the wrapper this adapter owns. Cancel an obsolete, closed, disposed or cancelled response rather than returning an old outline or invented empty success. Other unchanged documents remain usable. The native SDK owns the outline UI and scheduling; this adapter owns only native request currentness.
     */
    start(): void {
        if (this.started || this.disposed) return;
        this.started = true;
        const options = this.client.clientOptions;
        options.diagnosticPullOptions = { ...options.diagnosticPullOptions, onChange: true };
        const middleware = options.middleware ??= {};
        const previous = middleware.provideDiagnostics;
        const guard: NonNullable<typeof previous> = async (document, previousResultId, token, next) => {
            const captured = 'version' in document ? document : workspace.textDocuments.find(open => open.uri.toString() === document.toString());
            if (this.disposed || token.isCancellationRequested || !captured || captured.isClosed || !workspace.textDocuments.includes(captured)) throw new CancellationError();
            const version = captured.version;
            const result = await (previous ? previous(document, previousResultId, token, next) : next(document, previousResultId, token));
            if (this.disposed || token.isCancellationRequested || (captured.isClosed || captured.version !== version || !workspace.textDocuments.includes(captured))) {
                throw new CancellationError();
            }
            return result;
        };
        middleware.provideDiagnostics = guard;
        const previousDefinition = middleware.provideDefinition;
        const definitionGuard: NonNullable<typeof previousDefinition> = async (document, position, token, next) => {
            const current = (captured: typeof document, version: number) => !this.disposed && !token.isCancellationRequested &&
                !captured.isClosed && captured.version === version && workspace.textDocuments.includes(captured);
            const version = document.version;
            if (!current(document, version)) throw new CancellationError();
            const targets = new Map(workspace.textDocuments.filter(open => !open.isClosed)
                .map(open => [open.uri.toString(), { document: open, version: open.version }]));
            const result = await (previousDefinition ? previousDefinition(document, position, token, next) : next(document, position, token));
            if (!current(document, version)) throw new CancellationError();
            for (const location of Array.isArray(result) ? result : result ? [result] : []) {
                const uri = 'targetUri' in location ? location.targetUri : location.uri;
                const target = targets.get(uri.toString());
                if (target && !current(target.document, target.version)) throw new CancellationError();
            }
            return result;
        };
        middleware.provideDefinition = definitionGuard;
        const previousHover = middleware.provideHover;
        const hoverGuard: NonNullable<typeof previousHover> = async (document, position, token, next) => {
            const current = (captured: typeof document, version: number) => !this.disposed && !token.isCancellationRequested &&
                !captured.isClosed && captured.version === version && workspace.textDocuments.includes(captured);
            if (!current(document, document.version)) throw new CancellationError();
            const captured = new Map(workspace.textDocuments.filter(open => !open.isClosed && open.languageId === 'expec')
                .map(open => [open, open.version]));
            captured.set(document, document.version);
            const result = await (previousHover ? previousHover(document, position, token, next) : next(document, position, token));
            if ([...captured].some(([buffer, version]) => !current(buffer, version))) throw new CancellationError();
            return result;
        };
        middleware.provideHover = hoverGuard;
        this.releaseMiddleware = () => {
            if (middleware.provideDiagnostics === guard) middleware.provideDiagnostics = previous;
            if (middleware.provideDefinition === definitionGuard) middleware.provideDefinition = previousDefinition;
            if (middleware.provideHover === hoverGuard) middleware.provideHover = previousHover;
        };
        this.context.subscriptions.push(this);
        void this.client.start().catch(error => this.client.error('.expec language server failed to start.', error, true));
    }
    /**
     * Unverified implementation obligation.
     * Invalidate adapter-owned callbacks and remove owned registrations once. The native entry point owns the injected client and awaits its one stop promise on deactivation; this operation neither stops that client twice nor promises synchronous process termination.
     */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.releaseMiddleware?.();
        this.releaseMiddleware = undefined;
    }
}
