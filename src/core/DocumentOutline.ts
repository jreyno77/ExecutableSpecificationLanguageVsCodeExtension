import type { SourceDocument } from "./SourceDocument.js";
import type { DocumentReport } from "./DocumentReport.js";
import type { SourceOutline } from "./SourceOutline.js";
/** Number profile: JavaScript binary64. */



/**
 * Unverified implementation obligation.
 * Requires package: expec (runtime)
 * Requires package: typescript (build)
 * Requires package: vitest (test)
 */
export class DocumentOutline {
    constructor() {
        throw new Error("Not implemented: DocumentOutline.construction");
    }
    /**
     * Unverified implementation obligation.
     * Receive current immutable DocumentAnalysis publications from the same live analysis, including replacements at the same editor version after dependency changes. Reject noninteger or negative versions with RangeError before changing state. Prepare the current document's ordered declaration tree once from that report's public Inspection and exact captured source. This is authored structure, not a checked Specification or a claim that every reference resolves. Independent compiler problems or deferred requirements do not suppress supported declarations. Rejected entry syntax or missing exact captured text withdraws the old outline. Never parse, resolve, compile, discover files, read saved text or substitute an older accepted report here.
     * Include only source-authored component, concept, class, interface, record-type-declaration, alias-type-declaration, opaque-type-declaration, field, function and capability items belonging to this exact source URI. Names are the public decoded names; kind is exactly the listed language kind. Use each item's actual finite source origin and nameOrigin, requiring the nonempty name selection to be contained in the whole declaration and both ranges to fit the captured text. Preserve source order and actual public parent/children containment. Omit local wrappers while retaining their supported declarations beneath the nearest supported enclosing declaration. Do not emit import/public references, parameters, helpers, examples, scenario/interaction support, external or builtin nodes; do not promote declarations from excluded example/helper bodies. Do not infer nesting from spelling, references or dependencies. Imported declarations never become this document's outline.
     * Each emitted child's whole range must also be contained in its emitted parent's whole range. Omit an invalid supported declaration and its subtree rather than invent ranges or promote its children into a different parent.
     */
    published(source: SourceDocument, version: number, report: DocumentReport): void {
        throw new Error("Not implemented: DocumentOutline.published");
    }
    /**
     * Unverified implementation obligation.
     * Forget this exact document's outline when DocumentAnalysis ends its lifetime. Repeated close is harmless and other documents remain usable. A later current publication after reopening starts a new lifetime and may have a lower version.
     */
    closed(uri: string): void {
        throw new Error("Not implemented: DocumentOutline.closed");
    }
    /**
     * Unverified implementation obligation.
     * Reject a noninteger or negative version with RangeError before changing state. Return the prepared outline only for the exact retained URI/version and current captured text. A current accepted document with no supported declarations has an empty symbols list. Missing, stale, rejected, closed or disposed publications return absence. The reply includes the exact captured source used for all whole/name scalar ranges. A request performs no Inspection walk, parsing, checking, acquisition, generation or project scan. Caller mutation cannot change retained state or other earlier/current replies; use immutable values or independent copies. This operation never writes files or changes editor selection.
     */
    symbols(uri: string, version: number): SourceOutline | undefined {
        throw new Error("Not implemented: DocumentOutline.symbols");
    }
    /**
     * Unverified implementation obligation.
     * End this outline lifetime, clear retained trees and ignore later publications. All queries return absence; repeated disposal is harmless.
     */
    dispose(): void {
        throw new Error("Not implemented: DocumentOutline.dispose");
    }
}
