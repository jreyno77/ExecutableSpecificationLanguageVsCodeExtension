import { InsertTextFormat } from 'vscode-languageserver';
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
    private readonly completion: SourceCompletion;
    constructor(completion: SourceCompletion) {
        this.completion = completion;
    }
    /**
     * Unverified implementation obligation.
     * Convert this exact standard LSP TextDocument and zero-based UTF-16 Position to one current SourceCompletion query. Invalid, fractional, negative, out-of-line or surrogate-interior positions give an empty list, never a clamped query. Require the reply's captured URI/text to match this document exactly and a finite single-line range containing this requested position. Return standard plain-text CompletionItems labelled by eligible spelling with an exact TextEdit for only the captured final token, using the SDK insertionText unchanged and actual targetName as plain detail. No inferred implementation or validity, snippets, command, additionalTextEdits, resolve handler, trusted Markdown or generated edits. Absence stays an empty list. This adapter owns coordinates and presentation, not scope, parsing, resolution, acquisition, generation or file mutation.
     */
    items(document: TextDocument, position: Position): Array<CompletionItem> {
        if (!Number.isInteger(position.line) || !Number.isInteger(position.character) || position.line < 0 || position.character < 0) return [];
        const text = document.getText(), offset = document.offsetAt(position), roundTrip = document.positionAt(offset);
        if (roundTrip.line !== position.line || roundTrip.character !== position.character) return [];
        const previous = text.charCodeAt(offset - 1), current = text.charCodeAt(offset);
        if (previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff) return [];
        const scalarOffset = Array.from(text.slice(0, offset)).length;
        const reply = this.completion.completion(document.uri, document.version, scalarOffset);
        if (!reply || reply.source.uri !== document.uri || reply.source.text !== text) return [];
        const { startOffset, endOffset } = reply;
        if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset) || startOffset < 0 || startOffset >= endOffset ||
            scalarOffset < startOffset || scalarOffset > endOffset) return [];
        const offsets = [0];
        for (const scalar of text) offsets.push(offsets[offsets.length - 1]! + scalar.length);
        const start = offsets[startOffset], end = offsets[endOffset];
        if (start === undefined || end === undefined || /[\r\n\u2028\u2029]/u.test(text.slice(start, end))) return [];
        const range = { start: document.positionAt(start), end: document.positionAt(end) };
        if (range.start.line !== range.end.line) return [];
        return reply.suggestions.map(suggestion => ({ label: suggestion.spelling, detail: suggestion.targetName,
            insertTextFormat: InsertTextFormat.PlainText, textEdit: { range, newText: suggestion.insertionText } }));
    }
}
