import type { SourceNavigation } from "../core/SourceNavigation.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Position } from "vscode-languageserver";
import type { Location } from "vscode-languageserver";




/**
 * Unverified implementation obligation.
 * Requires package: language-server (runtime)
 * Requires package: language-server-document (runtime)
 * Requires package: typescript (build)
 * Requires package: vitest (test)
 * Requires package: vscode-test-electron (test)
 * Depends on: SourceNavigation
 */
export class SourceDefinitionAdapter {
    constructor(navigation: SourceNavigation) {
        throw new Error("Not implemented: SourceDefinitionAdapter.construction");
    }
    /**
     * Unverified implementation obligation.
     * Translate a standard LSP UTF-16 position using this exact current TextDocument text into a zero-based Unicode-scalar offset, and ask core SourceNavigation.definition once with its exact URI/version. Reject noninteger, negative or out-of-line positions with absence; do not clamp them or split a surrogate pair into a guessed scalar. Translate the returned authored name range back to standard UTF-16 Location using the reply's exact captured target text and URI. Absence stays absence. This adapter owns only coordinate/protocol conversion; it never parses, resolves, compiles, chooses a declaration, reads files, saves or generates. The shared LanguageServerAdapter owns its one registration and current document lifecycle; no second DocumentAnalysis is constructed.
     */
    definition(document: TextDocument, position: Position): Location | undefined {
        throw new Error("Not implemented: SourceDefinitionAdapter.definition");
    }
}
