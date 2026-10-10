import { SymbolKind } from 'vscode-languageserver';
import { TextDocument as ProtocolTextDocument } from 'vscode-languageserver-textdocument';
import type { SourceOutlineSymbol } from '../core/SourceOutlineSymbol.js';
import type { DocumentOutline } from "../core/DocumentOutline.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { DocumentSymbol } from "vscode-languageserver";



/**
 * Unverified implementation obligation.
 * Requires package: language-server (runtime)
 * Requires package: language-server-document (runtime)
 * Requires package: typescript (build)
 * Requires package: vitest (test)
 * Requires package: vscode-test-electron (test)
 * Depends on: DocumentOutline
 */
export class SourceOutlineAdapter {
    private readonly outline: DocumentOutline;
    constructor(outline: DocumentOutline) {
        this.outline = outline;
    }
    /**
     * Unverified implementation obligation.
     * Ask the one supplied DocumentOutline for this exact native document URI/version. Without a current reply whose captured URI and text exactly match document.getText(), return an empty list. Convert the reply's whole and authored-name scalar offsets to zero-based UTF-16 LSP range and selectionRange against that same captured text, retaining decoded names, source order and nested children. Require finite integer offsets, valid scalar boundaries and whole-range containment of the nonempty name selection; reject an invalid reply rather than clamp, widen or guess. Use native DocumentSymbol values only: component maps to Module, concept to Object, class to Class, interface to Interface, record-type-declaration to Struct, alias-type-declaration and opaque-type-declaration to Class, field to Field, function to Function and capability to Method. This mapping describes presentation, not a new type system. Never parse, resolve, compile, read files, generate, select targets or rebuild the tree in this adapter.
     * Native DocumentSymbol names must contain nonwhitespace text. Omit a symbol with an empty or whitespace-only decoded name and its whole subtree, retaining other valid siblings in order. Never fabricate a display name or promote its children beneath a different parent. Core retains the actual decoded language facts.
     */
    symbols(document: TextDocument): Array<DocumentSymbol> {
        const reply = this.outline.symbols(document.uri, document.version);
        const text = document.getText();
        if (!reply || reply.source.uri !== document.uri || reply.source.text !== text) return [];
        const offsets = [0];
        for (const scalar of text) offsets.push(offsets[offsets.length - 1] + scalar.length);
        const captured = ProtocolTextDocument.create(reply.source.uri, document.languageId, document.version, text);
        return this.convert(reply.symbols, offsets, captured) ?? [];
    }
    private convert(symbols: readonly SourceOutlineSymbol[], offsets: readonly number[], captured: TextDocument,
        parent?: { start: number; end: number }): DocumentSymbol[] | undefined {
        const kinds: Readonly<Record<string, SymbolKind>> = {
            component: SymbolKind.Module, concept: SymbolKind.Object, class: SymbolKind.Class, interface: SymbolKind.Interface,
            'record-type-declaration': SymbolKind.Struct, 'alias-type-declaration': SymbolKind.Class,
            'opaque-type-declaration': SymbolKind.Class, field: SymbolKind.Field, function: SymbolKind.Function, capability: SymbolKind.Method,
        };
        const converted: DocumentSymbol[] = [];
        for (const symbol of symbols) {
            if (!symbol.name.trim()) continue;
            const { startOffset: start, endOffset: end, nameStartOffset: nameStart, nameEndOffset: nameEnd } = symbol;
            if (![start, end, nameStart, nameEnd].every(Number.isInteger) || start < 0 || end <= start || end >= offsets.length ||
                nameStart < start || nameEnd <= nameStart || nameEnd > end ||
                parent && (start < parent.start || end > parent.end)) return undefined;
            if (!Object.prototype.hasOwnProperty.call(kinds, symbol.kind)) return undefined;
            const kind = kinds[symbol.kind];
            const children = this.convert(symbol.children, offsets, captured, { start, end });
            if (children === undefined) return undefined;
            converted.push({ name: symbol.name, kind,
                range: { start: captured.positionAt(offsets[start]), end: captured.positionAt(offsets[end]) },
                selectionRange: { start: captured.positionAt(offsets[nameStart]), end: captured.positionAt(offsets[nameEnd]) }, children });
        }
        return converted;
    }
}
