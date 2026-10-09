import { DidChangeWatchedFilesNotification } from 'vscode-languageserver/node';
import { DocumentAnalysis as CoreDocumentAnalysis } from '../core/DocumentAnalysis.js';
import { TextDocuments, TextDocumentSyncKind, DiagnosticSeverity, type Diagnostic, type Disposable } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { DocumentAnalysis } from "../core/DocumentAnalysis.js";
import type { Connection } from "vscode-languageserver/node";
import type { SourceDocument } from "../core/SourceDocument.js";
import type { SyntaxDiagnostic } from "executable-specification-language";
import type { DocumentSources } from "../core/DocumentSources.js";

import type { DocumentReport } from "../core/DocumentReport.js";

/** Number profile: JavaScript binary64. */




/**
 * Unverified implementation obligation.
 * Requires package: language-server (runtime)
 * Requires package: language-server-document (runtime)
 * Requires package: expec (runtime)
 * Requires package: typescript (build)
 * Depends on: DocumentAnalysis
 */
export class LanguageServerAdapter {
    private readonly connection: Connection;
    private readonly analysis: DocumentAnalysis;
    private readonly documents = new TextDocuments(TextDocument);
    private readonly subscriptions: Disposable[] = [];
    private readonly reports = new Map<string, { resultId: string; items: Diagnostic[]; dependencies: readonly string[] }>();
    private readonly watches = new Map<string, { registration?: Disposable }>();
    private readonly unsupportedWatches = new Set<string>();
    private initialized = false;
    private canWatch = false;
    private canRefresh = false;
    private warnedWatchSupport = false;
    private reportSequence = 0;
    private started = false;
    private disposed = false;
    constructor(connection: Connection, sources: DocumentSources) {
        this.connection = connection;
        this.analysis = new CoreDocumentAnalysis(this, sources);
    }
    /**
     * Unverified implementation obligation.
     * Register native LSP initialization and document events once, using TextDocuments to reconstruct incremental text. Feed actual open/change/close snapshots and versions to core DocumentAnalysis. Opening must check exactly once despite TextDocuments also emitting a content-change event. Core owns checking and version/lifetime policy; this adapter owns protocol registration and translation. Register standard LSP document diagnostic pull with inter-file dependencies and no workspace diagnostic enumeration, and negotiate UTF-16 positions. Register standard LSP watched-file notifications for requested dependency URIs, including currently missing files, using native relative-pattern registration. Core chooses relevant invalidation; forward creation/change/deletion to sourceChanged. Reconcile capture-to-watch gaps by rechecking after each newly established registration. Retain registrations only for dependency URIs requested by current open entries, and dispose them when unneeded or on shutdown. Unsupported native watch capabilities remain an observable limitation rather than a promised live update. Do not scan or compile in the adapter.
     */
    start(): void {
        if (this.started || this.disposed) return;
        this.started = true;
        this.subscriptions.push(
            this.connection.onInitialize(({ capabilities }) => {
                const watches = capabilities.workspace?.didChangeWatchedFiles;
                this.canWatch = watches?.dynamicRegistration === true && watches.relativePatternSupport === true;
                this.canRefresh = capabilities.workspace?.diagnostics?.refreshSupport === true;
                return { capabilities: {
                    positionEncoding: 'utf-16',
                    textDocumentSync: TextDocumentSyncKind.Incremental,
                    diagnosticProvider: { interFileDependencies: true, workspaceDiagnostics: false },
                } };
            }),
            this.connection.onInitialized(() => {
                this.initialized = true;
                this.updateWatches();
            }),
            this.documents.onDidOpen(({ document }) => this.analysis.opened({ uri: document.uri, text: document.getText() }, document.version)),
            this.documents.onDidChangeContent(({ document }) => this.analysis.changed({ uri: document.uri, text: document.getText() }, document.version)),
            this.documents.onDidClose(({ document }) => this.analysis.closed(document.uri)),
            this.connection.onDidChangeWatchedFiles(({ changes }) => {
                if (!this.disposed) for (const change of changes) this.analysis.sourceChanged(change.uri);
            }),
            this.connection.languages.diagnostics.on(({ textDocument }) => {
                const report = this.reports.get(textDocument.uri);
                return { kind: 'full', resultId: report?.resultId, items: report?.items ?? [] };
            }),
            this.documents.listen(this.connection),
        );
    }
    /**
     * Unverified implementation obligation.
     * Retain real syntax and compiler errors whose primary source URI matches this document in its current native pull cache. Foreign primary findings remain in the raw Compilation and output log; an open imported document receives its own entry analysis. Never attach a foreign primary range to the requesting document. Convert each scalar range with the captured text for that range's exact URI, including cross-file related information. Preserve messages and codes. Keep nonlocated problems and deferred requirements observable in the language-client output log without inventing editor positions. Replace old feedback, including an empty full report when findings clear. Give each accepted publication an opaque analysis resultId; editor version alone cannot identify changed imports. Request the SDK diagnostic refresh after dependent feedback changes. Never reparse, generate or make semantic decisions here.
     */
    publish(source: SourceDocument, version: number, report: DocumentReport): void {
        if (this.disposed) return;
        const snapshots = new Map(report.sources.map(snapshot => [snapshot.uri, snapshot]));
        snapshots.set(source.uri, source);
        const positions = new Map<string, { document: TextDocument; offsets: number[] }>();
        const range = (location: SyntaxDiagnostic['primaryRange']): Diagnostic['range'] | undefined => {
            let captured = positions.get(location.sourceId);
            if (!captured) {
                const snapshot = snapshots.get(location.sourceId);
                if (!snapshot) {
                    this.connection.console.warn('No captured text for diagnostic location: ' + JSON.stringify(location));
                    return undefined;
                }
                const offsets = [0];
                for (const scalar of snapshot.text) offsets.push(offsets[offsets.length - 1] + scalar.length);
                captured = { document: TextDocument.create(snapshot.uri, 'expec', version, snapshot.text), offsets };
                positions.set(snapshot.uri, captured);
            }
            const start = captured.offsets[location.start.offset];
            const end = captured.offsets[location.end.offset];
            if (start === undefined || end === undefined) {
                this.connection.console.warn('Diagnostic location is outside captured text: ' + JSON.stringify(location));
                return undefined;
            }
            return { start: captured.document.positionAt(start), end: captured.document.positionAt(end) };
        };
        const items: Diagnostic[] = [];
        const append = (code: string, message: string, primary: SyntaxDiagnostic['primaryRange'], related: readonly SyntaxDiagnostic['primaryRange'][]) => {
            if (primary.sourceId !== source.uri) {
                this.connection.console.warn('[' + code + '] ' + message + ' ' + JSON.stringify(primary));
                return;
            }
            const primaryRange = range(primary);
            if (!primaryRange) return;
            const relatedInformation: NonNullable<Diagnostic['relatedInformation']> = [];
            for (const location of related) {
                const relatedRange = range(location);
                if (relatedRange) relatedInformation.push({ location: { uri: location.sourceId, range: relatedRange }, message });
            }
            items.push({ severity: DiagnosticSeverity.Error, source: 'expec', code, message, range: primaryRange, relatedInformation });
        };
        for (const problem of report.syntax) append(problem.category, problem.explanation, problem.primaryRange, problem.relatedRanges);
        for (const problem of report.compilation?.problems ?? []) {
            if (problem.at.kind !== 'source') {
                this.connection.console.warn('[' + problem.code + '] ' + problem.message + ' ' + JSON.stringify(problem.at));
                continue;
            }
            const related: SyntaxDiagnostic['primaryRange'][] = [];
            for (const location of problem.related) {
                if (location.kind === 'source') related.push(location.range);
                else this.connection.console.warn('[' + problem.code + '] Related prerequisite: ' + JSON.stringify(location));
            }
            append(problem.code, problem.message, problem.at.range, related);
        }
        for (const requirement of report.compilation?.deferred ?? []) {
            this.connection.console.warn('[' + requirement.reason + '] Requires ' + requirement.requires + ' ' + JSON.stringify(requirement.origin));
        }
        this.reports.set(source.uri, { resultId: 'analysis-' + ++this.reportSequence, items, dependencies: [...report.dependencies] });
        this.updateWatches();
        if (this.initialized && this.canRefresh) {
            void this.connection.languages.diagnostics.refresh().catch(error => this.connection.console.error('Diagnostic refresh failed: ' + String(error)));
        }
    }
    /**
     * Unverified implementation obligation.
     * Remove the closed document from the pull-response cache. Native document diagnostic pull owns editor close cleanup; never resurrect a cached response from an earlier lifetime.
     */
    clear(uri: string): void {
        this.reports.delete(uri);
        this.updateWatches();
    }
    /**
     * Unverified implementation obligation.
     * Remove owned subscriptions, end tracked document lifetimes and prevent further diagnostic publication. Repeated disposal is harmless. Leave connection/process shutdown to the native server entry point.
     */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const subscription of this.subscriptions.splice(0)) subscription.dispose();
        for (const uri of this.documents.keys()) this.analysis.closed(uri);
        this.reports.clear();
        for (const watch of this.watches.values()) watch.registration?.dispose();
        this.watches.clear();
        this.unsupportedWatches.clear();
    }
    private updateWatches(): void {
        if (this.disposed || !this.initialized) return;
        const needed = new Set([...this.reports.values()].flatMap(report => [...report.dependencies]));
        for (const [uri, watch] of this.watches) {
            if (!needed.has(uri)) {
                this.watches.delete(uri);
                watch.registration?.dispose();
            }
        }
        for (const uri of this.unsupportedWatches) if (!needed.has(uri)) this.unsupportedWatches.delete(uri);
        if (!this.canWatch) {
            if (needed.size && !this.warnedWatchSupport) {
                this.warnedWatchSupport = true;
                this.connection.console.warn('This client does not support dynamic relative file watches; saved imports cannot update automatically.');
            }
            return;
        }
        for (const uri of needed) {
            if (this.watches.has(uri) || this.unsupportedWatches.has(uri)) continue;
            const location = new URL(uri);
            if (location.protocol !== 'file:') {
                this.unsupportedWatches.add(uri);
                this.connection.console.warn('Cannot watch a non-file dependency: ' + uri);
                continue;
            }
            const name = decodeURIComponent(location.pathname.slice(location.pathname.lastIndexOf('/') + 1));
            const pattern = name.replace(/[?*\[\]{}]/g, character => '[' + character + ']');
            const watch: { registration?: Disposable } = {};
            this.watches.set(uri, watch);
            void this.connection.client.register(DidChangeWatchedFilesNotification.type, {
                watchers: [{ globPattern: { baseUri: new URL('.', location).href, pattern } }],
            }).then(registration => {
                if (this.disposed || this.watches.get(uri) !== watch) {
                    registration.dispose();
                    return;
                }
                watch.registration = registration;
                try {
                    this.analysis.sourceChanged(uri);
                } catch (error) {
                    this.connection.console.error('Dependency recheck failed for ' + uri + ': ' + String(error));
                }
            }).catch(error => {
                if (this.watches.get(uri) === watch) this.watches.delete(uri);
                this.connection.console.error('Dependency watch failed for ' + uri + ': ' + String(error));
            });
        }
    }

}
