import { TextDocument as ProtocolTextDocument } from 'vscode-languageserver-textdocument';
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
    private readonly navigation: SourceNavigation;
    constructor(navigation: SourceNavigation) {
        this.navigation = navigation;
    }
    /**
     * Unverified implementation obligation.
     * Translate a standard LSP UTF-16 position using this exact current TextDocument text into a zero-based Unicode-scalar offset, and ask core SourceNavigation.definition once with its exact URI/version. Reject noninteger, negative or out-of-line positions with absence; do not clamp them or split a surrogate pair into a guessed scalar. Translate the returned authored name range back to standard UTF-16 Location using the reply's exact captured target text and URI. Absence stays absence. This adapter owns only coordinate/protocol conversion; it never parses, resolves, compiles, chooses a declaration, reads files, saves or generates. The shared LanguageServerAdapter owns its one registration and current document lifecycle; no second DocumentAnalysis is constructed.
     */
    definition(document: TextDocument, position: Position): Location | undefined {
        if (!Number.isInteger(position.line) || !Number.isInteger(position.character) || position.line < 0 || position.character < 0) return undefined;
        const text = document.getText();
        const offset = document.offsetAt(position);
        const roundTrip = document.positionAt(offset);
        if (roundTrip.line !== position.line || roundTrip.character !== position.character) return undefined;
        const previous = text.charCodeAt(offset - 1), current = text.charCodeAt(offset);
        if (previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff) return undefined;
        const scalarOffset = Array.from(text.slice(0, offset)).length;
        const target = this.navigation.definition(document.uri, document.version, scalarOffset);
        if (!target) return undefined;
        const offsets = [0];
        for (const scalar of target.source.text) offsets.push(offsets[offsets.length - 1] + scalar.length);
        const start = offsets[target.startOffset], end = offsets[target.endOffset];
        if (start === undefined || end === undefined) return undefined;
        const captured = ProtocolTextDocument.create(target.source.uri, 'expec', 0, target.source.text);
        return { uri: target.source.uri, range: { start: captured.positionAt(start), end: captured.positionAt(end) } };
    }
}
