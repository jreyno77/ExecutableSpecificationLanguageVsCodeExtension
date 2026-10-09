import type { SourceDocument } from "./SourceDocument.js";
import type { SyntaxDiagnostic } from "executable-specification-language";
import type { DocumentReport } from "./DocumentReport.js";

/** Number profile: JavaScript binary64. */


export interface DocumentFeedback {
    /**
     * Unverified implementation obligation.
     * Publish the report for this exact immutable snapshot and version. Preserve actual reader diagnostics and the complete compiler result, including nonlocated problems and deferred requirements. Compilation is absent for rejected entry syntax. Inspection is absent for rejected entry syntax; otherwise it is a public QueryInspection over the same SourceComposer Resolution.model passed to Compiler, captured once without another resolution pass. It preserves bound, invalid and deferred reference facts even when Compilation has problems or no Specification. Never retain an older Inspection after rejection. Sources are the captured texts used for located findings; dependencies are exact source URIs requested, including unavailable imports. An empty diagnostic result replaces previous problems; absence of problems alone does not establish compilation success.
     */
    publish(source: SourceDocument, version: number, report: DocumentReport): void;
    /**
     * Unverified implementation obligation.
     * Remove all diagnostic feedback for this exact document URI.
     */
    clear(uri: string): void;
}
