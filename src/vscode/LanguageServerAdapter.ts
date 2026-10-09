import { DocumentAnalysis as CoreDocumentAnalysis } from '../core/DocumentAnalysis.js';
import { TextDocuments, TextDocumentSyncKind, DiagnosticSeverity, type Diagnostic, type Disposable } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { DocumentAnalysis } from "../core/DocumentAnalysis.js";
import type { Connection } from "vscode-languageserver/node";
import type { SourceDocument } from "../core/SourceDocument.js";
import type { SyntaxDiagnostic } from "executable-specification-language";
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
    private readonly reports = new Map<string, { version: number; items: Diagnostic[] }>();
    private started = false;
    private disposed = false;
    constructor(connection: Connection) {
        this.connection = connection;
        this.analysis = new CoreDocumentAnalysis(this);
    }
    /**
     * Unverified implementation obligation.
     * Register native LSP initialization and document events once, using TextDocuments to reconstruct incremental text. Feed actual open/change/close snapshots and versions to core DocumentAnalysis. Opening must check exactly once despite TextDocuments also emitting a content-change event. Core owns checking and version/lifetime policy; this adapter owns protocol registration and translation. Register standard LSP document diagnostic pull with no cross-file/workspace diagnostics yet, and negotiate UTF-16 positions.
     */
    start(): void {
        if (this.started || this.disposed) return;
        this.started = true;
        this.subscriptions.push(
            this.connection.onInitialize(() => ({ capabilities: {
                positionEncoding: 'utf-16',
                textDocumentSync: TextDocumentSyncKind.Incremental,
                diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
            } })),
            this.documents.onDidOpen(({ document }) => this.analysis.opened({ uri: document.uri, text: document.getText() }, document.version)),
            this.documents.onDidChangeContent(({ document }) => this.analysis.changed({ uri: document.uri, text: document.getText() }, document.version)),
            this.documents.onDidClose(({ document }) => this.analysis.closed(document.uri)),
            this.connection.languages.diagnostics.on(({ textDocument }) => {
                const report = this.reports.get(textDocument.uri);
                return { kind: 'full', resultId: report ? String(report.version) : undefined, items: report?.items ?? [] };
            }),
            this.documents.listen(this.connection),
        );
    }
    /**
     * Unverified implementation obligation.
     * Retain the real error diagnostics for this exact source URI, text and version as the current native pull-response cache. Convert Unicode scalar ranges, including related ranges, to zero-based UTF-16 using the supplied snapshot; preserve explanation and category. An empty list replaces the cached problems and yields an empty full diagnostic report when the native client requests it. Never guess a location, reparse source, generate files or read disk.
     */
    publish(source: SourceDocument, version: number, problems: Array<SyntaxDiagnostic>): void {
        if (this.disposed) return;
        const document = TextDocument.create(source.uri, 'expec', version, source.text);
        const offsets = [0];
        for (const scalar of source.text) offsets.push(offsets[offsets.length - 1] + scalar.length);
        const range = (location: SyntaxDiagnostic['primaryRange']) => ({
            start: document.positionAt(offsets[location.start.offset]),
            end: document.positionAt(offsets[location.end.offset]),
        });
        this.reports.set(source.uri, { version, items: problems.map(problem => ({
            severity: DiagnosticSeverity.Error, source: 'expec', code: problem.category,
            message: problem.explanation, range: range(problem.primaryRange),
            relatedInformation: problem.relatedRanges.map(location => ({
                location: { uri: location.sourceId, range: range(location) }, message: problem.explanation,
            })),
        })) });
    }
    /**
     * Unverified implementation obligation.
     * Remove the closed document from the pull-response cache. Native document diagnostic pull owns editor close cleanup; never resurrect a cached response from an earlier lifetime.
     */
    clear(uri: string): void {
        this.reports.delete(uri);
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
    }
}
