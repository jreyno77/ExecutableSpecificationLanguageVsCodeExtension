import type { SourceDocument } from "./SourceDocument.js";
import type { SyntaxDiagnostic } from "executable-specification-language";
/** Number profile: JavaScript binary64. */


export interface DocumentFeedback {
    /**
     * Unverified implementation obligation.
     * Publish the problems for this exact immutable text snapshot and document version. An empty list replaces previous problems. Preserve the reader's explanations, categories and primary/related locations.
     */
    publish(source: SourceDocument, version: number, problems: Array<SyntaxDiagnostic>): void;
    /**
     * Unverified implementation obligation.
     * Remove all diagnostic feedback for this exact document URI.
     */
    clear(uri: string): void;
}
