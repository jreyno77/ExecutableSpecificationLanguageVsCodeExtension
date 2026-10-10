import type { SourceCompletion } from "../core/SourceCompletion.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Position } from "vscode-languageserver";
import type { CompletionItem } from "vscode-languageserver";




/**
 * Unverified implementation obligation.
 * Requires package: language-server (runtime)
 * Requires package: language-server-document (runtime)
 * Requires package: typescript (build)
 * Requires package: vitest (test)
 * Requires package: vscode-test-electron (test)
 * Depends on: SourceCompletion
 */
export class SourceCompletionAdapter {
    constructor(completion: SourceCompletion) {
        return;
    }
    /**
     * Unverified implementation obligation.
     * Convert this exact standard LSP TextDocument and zero-based UTF-16 Position to one current SourceCompletion query. Invalid, fractional, negative, out-of-line or surrogate-interior positions give an empty list, never a clamped query. Require the reply's captured URI/text to match this document exactly and a finite single-line range containing this requested position. Return standard plain-text CompletionItems labelled by eligible spelling with an exact TextEdit for only the captured final token, using the SDK insertionText unchanged and actual targetName as plain detail. No inferred implementation or validity, snippets, command, additionalTextEdits, resolve handler, trusted Markdown or generated edits. Absence stays an empty list. This adapter owns coordinates and presentation, not scope, parsing, resolution, acquisition, generation or file mutation.
     */
    items(document: TextDocument, position: Position): Array<CompletionItem> {
        return [];
    }
}
