import type { SourceReferences } from "../core/SourceReferences.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Position } from "vscode-languageserver";
import type { ReferencePresentation } from "./ReferencePresentation.js";




/**
 * Unverified implementation obligation.
 * Requires package: language-server (runtime)
 * Requires package: language-server-document (runtime)
 * Requires package: typescript (build)
 * Requires package: vitest (test)
 * Requires package: vscode-test-electron (test)
 * Depends on: SourceReferences
 */
export class SourceReferenceAdapter {
    constructor(references: SourceReferences) {
        throw new Error("Not implemented: SourceReferenceAdapter.construction");
    }
    /**
     * Unverified implementation obligation.
     * Translate this exact current standard TextDocument and LSP UTF-16 position to a Unicode-scalar cursor and call SourceReferences.search once with its URI/version and unchanged includeDeclaration flag. Invalid negative, fractional, out-of-line or surrogate-splitting positions return absence without clamping. Absent core results stay absent. Require the reply's requesting URI/text to equal this document. Validate each actual occurrence's finite nonempty scalar range against its supplied captured source before converting it to standard Location; do not guess from spelling, basename or saved files. Invalid replies return absence rather than a partial fabricated success. Preserve the core's ordered distinct locations and plain coverage/prerequisite lists. This adapter performs only protocol/coordinate conversion, never parsing, resolution, compilation, acquisition, scanning, saving or generation. LanguageServerAdapter owns one standard registration and the shared analysis lifetime.
     */
    references(document: TextDocument, position: Position, includeDeclaration: boolean): ReferencePresentation | undefined {
        throw new Error("Not implemented: SourceReferenceAdapter.references");
    }
}
