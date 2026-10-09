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
     * Request startup of the supplied native LanguageClient once. The native entry point owns its construction, packaged TypeScript server, expec selector (file and untitled), and single awaited stop on deactivation. Return that native client through the standard VS Code activation export for callers of its native feature APIs. Register owned resources with this extension context. Use native document diagnostic pull on edits. In the public provideDiagnostics middleware capture native document identity/version before awaiting next, then cancel an obsolete/closed result instead of returning empty success. The SDK owns scheduling, cancellation and diagnostic collections. Never replace newer feedback or reopen diagnostics for a closed document; do not rely on push version fields. Keep startup failures observable and keep core policy out of this host adapter.
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
        this.releaseMiddleware = () => { if (middleware.provideDiagnostics === guard) middleware.provideDiagnostics = previous; };
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
