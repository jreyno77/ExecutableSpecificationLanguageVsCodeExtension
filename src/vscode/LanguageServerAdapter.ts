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
    constructor(connection: Connection) {
        throw new Error("Not implemented: LanguageServerAdapter.construction");
    }
    /**
     * Unverified implementation obligation.
     * Register native LSP initialization and document events once, using TextDocuments to reconstruct incremental text. Feed actual open/change/close snapshots and versions to core DocumentAnalysis. Opening must check exactly once despite TextDocuments also emitting a content-change event. Core owns checking and version/lifetime policy; this adapter owns protocol registration and translation. Register standard LSP document diagnostic pull with no cross-file/workspace diagnostics yet, and negotiate UTF-16 positions.
     */
    start(): void {
        throw new Error("Not implemented: LanguageServerAdapter.start");
    }
    /**
     * Unverified implementation obligation.
     * Retain the real error diagnostics for this exact source URI, text and version as the current native pull-response cache. Convert Unicode scalar ranges, including related ranges, to zero-based UTF-16 using the supplied snapshot; preserve explanation and category. An empty list replaces the cached problems and yields an empty full diagnostic report when the native client requests it. Never guess a location, reparse source, generate files or read disk.
     */
    publish(source: SourceDocument, version: number, problems: Array<SyntaxDiagnostic>): void {
        throw new Error("Not implemented: LanguageServerAdapter.publish");
    }
    /**
     * Unverified implementation obligation.
     * Remove the closed document from the pull-response cache. Native document diagnostic pull owns editor close cleanup; never resurrect a cached response from an earlier lifetime.
     */
    clear(uri: string): void {
        throw new Error("Not implemented: LanguageServerAdapter.clear");
    }
    /**
     * Unverified implementation obligation.
     * Remove owned subscriptions, end tracked document lifetimes and prevent further diagnostic publication. Repeated disposal is harmless. Leave connection/process shutdown to the native server entry point.
     */
    dispose(): void {
        throw new Error("Not implemented: LanguageServerAdapter.dispose");
    }
}
