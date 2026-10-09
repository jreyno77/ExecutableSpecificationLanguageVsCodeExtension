import type { DocumentFeedback } from "./DocumentFeedback.js";
import type { SourceDocument } from "./SourceDocument.js";
/** Number profile: JavaScript binary64. */


/**
 * Unverified implementation obligation.
 * Requires package: expec (runtime)
 * Requires package: typescript (build)
 * Requires package: vitest (test)
 */
export class DocumentAnalysis {
    constructor(feedback: DocumentFeedback) {
        throw new Error("Not implemented: DocumentAnalysis.construction");
    }
    /**
     * Unverified implementation obligation.
     * Start an open document lifetime and check this exact supplied text using one retained LangiumReader. Publish the real reader problems, or an empty list for syntactically accepted source. Treat the URI as identity, including untitled and remote URIs. Do not read files, resolve imports, generate outputs or require a project connection. Versions are nonnegative integers; reject invalid versions with a RangeError before changing state.
     */
    opened(source: SourceDocument, version: number): void {
        throw new Error("Not implemented: DocumentAnalysis.opened");
    }
    /**
     * Unverified implementation obligation.
     * Reject a noninteger or negative version with a RangeError before changing state. For an open document, check and publish only a strictly newer version. Ignore duplicate, older and unopened-document changes. Retain the exact snapshot and version for publication. Check that the same lifetime/version is still current before publishing after any reentrant callback. The native caller excludes callbacks from an earlier document lifetime; URI/version alone cannot distinguish those after reopening. Syntax acceptance makes no semantic validity claim. Reader or publication exceptions must surface rather than masquerade as an empty successful result.
     */
    changed(source: SourceDocument, version: number): void {
        throw new Error("Not implemented: DocumentAnalysis.changed");
    }
    /**
     * Unverified implementation obligation.
     * End this open lifetime and clear its diagnostics. Ignore later changes until the document is opened again; reopening may start with a lower version. Repeated close is harmless. Other documents remain unchanged.
     */
    closed(uri: string): void {
        throw new Error("Not implemented: DocumentAnalysis.closed");
    }
}
