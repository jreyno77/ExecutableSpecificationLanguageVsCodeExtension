import { previewChannel } from './output-preview-channel.js';
import { CancellationError, workspace } from 'vscode';
import type { LanguageServerAdapter } from "./LanguageServerAdapter.js";
import type { ExtensionContext } from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";



/**
 * Unverified implementation obligation.
 * Requires package: language-client (runtime)
 * Depends on: LanguageServerAdapter
 */
export class EditorLanguageSupport {
    private readonly context: ExtensionContext;
    private readonly client: LanguageClient;
    private started = false;
    private disposed = false;
    private releaseMiddleware?: () => void;
    private renameConfigurationRevision = 0;
    constructor(context: ExtensionContext, client: LanguageClient) {
        this.context = context;
        this.client = client;
    }
    /**
     * Unverified implementation obligation.
     * Request startup of the supplied native LanguageClient once. The native entry point owns its construction, packaged TypeScript server, expec selector (file and untitled), and single awaited stop on deactivation. Return that native client through the standard VS Code activation export for callers of its native feature APIs. Register owned resources with this extension context. Use native document diagnostic pull on edits. In the public provideDiagnostics middleware capture native document identity/version before awaiting next, then cancel an obsolete/closed result instead of returning empty success. The SDK owns scheduling, cancellation and diagnostic collections. Never replace newer feedback or reopen diagnostics for a closed document; do not rely on push version fields. Guard public provideDefinition middleware with the requesting native document identity/version around its await, preserving prior middleware. Cancel obsolete, closed, disposed or cancelled requests rather than returning an old target. For returned target URIs already open when the request began, also refuse a result if that captured target buffer changed or ended its lifetime while awaiting. Core reports establish point-in-time meaning; this does not promise editor/filesystem atomicity across the process boundary. Guard public provideHover middleware with requesting native document identity/version around its await, preserving prior middleware. Capture the requesting document and currently open expec buffer identities/versions before awaiting. After the prior middleware or next resolves, cancel if disposed, token-cancelled, or any captured buffer changed, closed or was replaced, since a hover reply does not identify its declaration source across the native boundary. Restore only this adapter's own middleware on disposal. This conservative pending-request guard does not claim filesystem/editor atomicity or replace core resolution policy. Keep startup failures observable and keep core policy out of this host adapter.
     * Guard standard provideDocumentSymbols middleware with the requesting native document identity/version around awaiting next. Preserve prior middleware and restore only the wrapper this adapter owns. Cancel an obsolete, closed, disposed or cancelled response rather than returning an old outline or invented empty success. Other unchanged documents remain usable. The native SDK owns the outline UI and scheduling; this adapter owns only native request currentness.
     * Guard the public provideCompletionItem middleware around awaiting the prior middleware or real continuation, preserving its exact replies. Capture the requesting document identity/version and currently open expec buffer identities/versions. Cancel a pending reply after requester or captured import-buffer change, close or replacement, token cancellation or disposal. Other-language buffer changes do not cancel completion. Release only this adapter's own wrapper. This protects a pending response; it does not promise editor/filesystem atomicity or safety when a user later chooses an already returned item. Core owns candidate policy and prepared facts.
     * Guard standard provideReferences middleware around awaiting its prior middleware or next, preserving the actual includeDeclaration context and returned locations. Capture the requesting document and all currently open expec buffer identities/versions; cancel if the requester or any captured buffer changed, closed or was replaced, or if disposed/token-cancelled. Preserve prior middleware and restore only this wrapper on disposal. The native LanguageClient handles standard server ShowMessageRequests for the visible bounded coverage summary/action; no separate coverage channel or business model is added here. Native SDK owns reference navigation and selection. This is a point-in-time report, not editor/filesystem atomicity; no native scans, saves or generation are added.
     * Guard the standard prepareRename and provideRenameEdits middleware around awaiting the previous middleware or real continuation. Preserve decoded newName and the exact native result; capture requesting document identity/version plus all currently open .expec buffer identities/versions. Cancel if a captured buffer changes, closes or is replaced, the request token is cancelled, the selected configuration notification revision changes, or this adapter is disposed. Restore only owned wrappers and preserve prior middleware. Standard VS Code owns rename input, preview/apply, optional preview selection and undo; never write files or claim atomicity after a returned response. No duplicate native edit application or generated-output invocation.
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
        const previousSymbols = middleware.provideDocumentSymbols;
        const symbolGuard: NonNullable<typeof previousSymbols> = async (document, token, next) => {
            const version = document.version;
            const current = () => !this.disposed && !token.isCancellationRequested && !document.isClosed &&
                document.version === version && workspace.textDocuments.includes(document);
            if (!current()) throw new CancellationError();
            const result = await (previousSymbols ? previousSymbols(document, token, next) : next(document, token));
            if (!current()) throw new CancellationError();
            return result;
        };
        middleware.provideDocumentSymbols = symbolGuard;
        const previousCompletion = middleware.provideCompletionItem;
        const completionGuard: NonNullable<typeof previousCompletion> = async (document, position, context, token, next) => {
            const current = (buffer: typeof document, version: number) => !this.disposed && !token.isCancellationRequested &&
                !buffer.isClosed && buffer.version === version && workspace.textDocuments.includes(buffer);
            if (!current(document, document.version)) throw new CancellationError();
            const captured = new Map(workspace.textDocuments.filter(open => !open.isClosed && open.languageId === 'expec')
                .map(open => [open, open.version]));
            captured.set(document, document.version);
            const result = await (previousCompletion ? previousCompletion(document, position, context, token, next)
                : next(document, position, context, token));
            if ([...captured].some(([buffer, version]) => !current(buffer, version))) throw new CancellationError();
            return result;
        };
        middleware.provideCompletionItem = completionGuard;
        const previousReferences = middleware.provideReferences;
        const referencesGuard: NonNullable<typeof previousReferences> = async (document, position, context, token, next) => {
            const current = (buffer: typeof document, version: number) => !this.disposed && !token.isCancellationRequested
                && !buffer.isClosed && buffer.version === version && workspace.textDocuments.includes(buffer);
            if (!current(document, document.version)) throw new CancellationError();
            const captured = new Map(workspace.textDocuments.filter(open => !open.isClosed && open.languageId === 'expec')
                .map(open => [open, open.version]));
            captured.set(document, document.version);
            const result = await (previousReferences ? previousReferences(document, position, context, token, next)
                : next(document, position, context, token));
            if ([...captured].some(([buffer, version]) => !current(buffer, version))) throw new CancellationError();
            return result;
        };
        middleware.provideReferences = referencesGuard;
        const previousSend = middleware.sendNotification;
        const sendGuard: NonNullable<typeof previousSend> = (type, next, params) => {
            if ((typeof type === 'string' ? type : type.method) === previewChannel.configuration) ++this.renameConfigurationRevision;
            return previousSend ? previousSend(type, next, params) : next(type, params);
        };
        middleware.sendNotification = sendGuard;
        const captureRename = (document: import('vscode').TextDocument, token: import('vscode').CancellationToken) => {
            const revision = this.renameConfigurationRevision;
            const captured = new Map(workspace.textDocuments.filter(open => !open.isClosed && open.languageId === 'expec').map(open => [open, open.version]));
            captured.set(document, document.version);
            const current = () => {
                if (this.disposed || token.isCancellationRequested || revision !== this.renameConfigurationRevision
                    || [...captured].some(([buffer, version]) => buffer.isClosed || buffer.version !== version || !workspace.textDocuments.includes(buffer))) {
                    throw new CancellationError();
                }
            };
            current(); return current;
        };
        const previousPrepare = middleware.prepareRename;
        const prepareGuard: NonNullable<typeof previousPrepare> = async (document, position, token, next) => {
            const current = captureRename(document, token);
            const result = await (previousPrepare ? previousPrepare(document, position, token, next) : next(document, position, token));
            current(); return result;
        };
        middleware.prepareRename = prepareGuard;
        const previousRename = middleware.provideRenameEdits;
        const renameGuard: NonNullable<typeof previousRename> = async (document, position, newName, token, next) => {
            const current = captureRename(document, token);
            const result = await (previousRename ? previousRename(document, position, newName, token, next) : next(document, position, newName, token));
            current(); return result;
        };
        middleware.provideRenameEdits = renameGuard;
        this.releaseMiddleware = () => {
            if (middleware.provideDiagnostics === guard) middleware.provideDiagnostics = previous;
            if (middleware.provideDefinition === definitionGuard) middleware.provideDefinition = previousDefinition;
            if (middleware.provideHover === hoverGuard) middleware.provideHover = previousHover;
            if (middleware.provideDocumentSymbols === symbolGuard) middleware.provideDocumentSymbols = previousSymbols;
            if (middleware.provideCompletionItem === completionGuard) middleware.provideCompletionItem = previousCompletion;
            if (middleware.provideReferences === referencesGuard) middleware.provideReferences = previousReferences;
            if (middleware.prepareRename === prepareGuard) middleware.prepareRename = previousPrepare;
            if (middleware.provideRenameEdits === renameGuard) middleware.provideRenameEdits = previousRename;
            if (middleware.sendNotification === sendGuard) middleware.sendNotification = previousSend;
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
