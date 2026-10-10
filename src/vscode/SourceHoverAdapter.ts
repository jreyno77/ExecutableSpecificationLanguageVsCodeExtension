import { TextDocument as ProtocolTextDocument } from 'vscode-languageserver-textdocument';
import type { SourceHover } from "../core/SourceHover.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Position } from "vscode-languageserver";
import type { Hover } from "vscode-languageserver";




/**
 * Unverified implementation obligation.
 * Requires package: language-server (runtime)
 * Requires package: language-server-document (runtime)
 * Requires package: typescript (build)
 * Requires package: vitest (test)
 * Requires package: vscode-test-electron (test)
 * Depends on: SourceHover
 */
export class SourceHoverAdapter {
    private readonly hover: SourceHover;
    constructor(hover: SourceHover) {
        this.hover = hover;
    }
    /**
     * Unverified implementation obligation.
     * Convert the exact current standard LSP TextDocument and UTF-16 Position to one SourceHover.hover query using its URI/version and a Unicode-scalar offset. Reject negative, fractional, out-of-line positions or positions inside a surrogate pair with absence; never clamp. Convert the reply's referring name range with its exact captured source back to a standard LSP Hover range. Render the authored signature in an expec fenced code block and its nonempty description as literal Markdown text beneath it. Choose a fence longer than any run of backticks in the signature, escape Markdown and HTML in the description, and never enable command links or trusted HTML. Absence stays absence. The adapter owns coordinates and presentation only; it never parses, checks, chooses a declaration, reads files, generates or constructs another analysis.
     */
    information(document: TextDocument, position: Position): Hover | undefined {
        if (!Number.isInteger(position.line) || !Number.isInteger(position.character) || position.line < 0 || position.character < 0) return undefined;
        const text = document.getText(), offset = document.offsetAt(position), roundTrip = document.positionAt(offset);
        if (roundTrip.line !== position.line || roundTrip.character !== position.character) return undefined;
        const previous = text.charCodeAt(offset - 1), current = text.charCodeAt(offset);
        if (previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff) return undefined;
        const result = this.hover.hover(document.uri, document.version, Array.from(text.slice(0, offset)).length);
        if (!result || result.source.uri !== document.uri || result.source.text !== text) return undefined;
        const offsets = [0];
        for (const scalar of result.source.text) offsets.push(offsets[offsets.length - 1] + scalar.length);
        const start = offsets[result.startOffset], end = offsets[result.endOffset];
        if (start === undefined || end === undefined || end < start) return undefined;
        const captured = ProtocolTextDocument.create(result.source.uri, 'expec', document.version, result.source.text);
        const runs = result.signature.match(/`+/g) ?? [];
        const fence = '`'.repeat(Math.max(3, ...runs.map(run => run.length + 1)));
        const code = fence + 'expec\n' + result.signature + '\n' + fence;
        return { contents: { kind: 'markdown', value: code + (result.description ? '\n\n' + this.literalMarkdown(result.description) : '') },
            range: { start: captured.positionAt(start), end: captured.positionAt(end) } };
    }
    private literalMarkdown(text: string): string {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/[\\`*_{}\[\]()#+!|~\-=]/g, '\\$&').replace(/^(\s*\d+)\./gm, '$1\\.');
    }
}
