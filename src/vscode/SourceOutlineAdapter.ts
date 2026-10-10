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
    constructor(outline: DocumentOutline) {
        throw new Error("Not implemented: SourceOutlineAdapter.construction");
    }
    /**
     * Unverified implementation obligation.
     * Ask the one supplied DocumentOutline for this exact native document URI/version. Without a current reply whose captured URI and text exactly match document.getText(), return an empty list. Convert the reply's whole and authored-name scalar offsets to zero-based UTF-16 LSP range and selectionRange against that same captured text, retaining decoded names, source order and nested children. Require finite integer offsets, valid scalar boundaries and whole-range containment of the nonempty name selection; reject an invalid reply rather than clamp, widen or guess. Use native DocumentSymbol values only: component maps to Module, concept to Object, class to Class, interface to Interface, record-type-declaration to Struct, alias-type-declaration and opaque-type-declaration to Class, field to Field, function to Function and capability to Method. This mapping describes presentation, not a new type system. Never parse, resolve, compile, read files, generate, select targets or rebuild the tree in this adapter.
     * Native DocumentSymbol names must contain nonwhitespace text. Omit a symbol with an empty or whitespace-only decoded name and its whole subtree, retaining other valid siblings in order. Never fabricate a display name or promote its children beneath a different parent. Core retains the actual decoded language facts.
     */
    symbols(document: TextDocument): Array<DocumentSymbol> {
        throw new Error("Not implemented: SourceOutlineAdapter.symbols");
    }
}
