import type { SourceDocument } from "./SourceDocument.js";
import type { DocumentReport } from "./DocumentReport.js";
import type { ReferenceSearch } from "./ReferenceSearch.js";
/** Number profile: JavaScript binary64. */



/**
 * Unverified implementation obligation.
 * Requires package: expec (runtime)
 * Requires package: typescript (build)
 * Requires package: vitest (test)
 */
export class SourceReferences {
    constructor() {
        throw new Error("Not implemented: SourceReferences.construction");
    }
    /**
     * Unverified implementation obligation.
     * Receive the same current immutable DocumentAnalysis publication as diagnostics and navigation, including replacement reports at an unchanged editor version after imported edits. Withdraw previous facts before preparing the new publication. Capture exact report.sources and prepare bound occurrences and source declaration name ranges through its one public Inspection, sharing privately prepared reference facts by immutable report identity. Match the actual target NodeId within this same report, never decoded spelling or declaration order. Rejected entry syntax or absent Inspection withdraws earlier results; rejected imported syntax does not silently substitute its previously accepted model. Current bound facts remain useful beside independent problems or deferred requirements. Never parse, resolve, compile, acquire files or make a second model. Invalid noninteger or negative versions throw RangeError before state changes; preparation errors surface after old facts are withdrawn. The caller excludes publications from a previous document lifetime.
     */
    published(source: SourceDocument, version: number, report: DocumentReport): void {
        throw new Error("Not implemented: SourceReferences.published");
    }
    /**
     * Unverified implementation obligation.
     * Forget this document's current lookup. Repeated close is harmless; other entries remain usable. Reopening begins a new lifetime and may publish a lower version.
     */
    closed(uri: string): void {
        throw new Error("Not implemented: SourceReferences.closed");
    }
    /**
     * Unverified implementation obligation.
     * Use only prepared facts for this exact URI/version and zero-based Unicode-scalar cursor. Reject noninteger or negative versions/offsets with RangeError. Select a bound reference's final identifier segment, or a named source declaration's own authored name, whose finite half-open range contains the cursor in the requesting captured source. Supported declarations are record, alias and opaque types, components, concepts, classes, interfaces, fields, parameters, type parameters, capabilities, functions, setup/action/observation helpers, checks and fixtures with an actual source nameOrigin. A wrapper or import alias spelling is not a fabricated declaration. Require the selected target's actual source nameOrigin and exact captured text; builtin, external, unnamed, uncaptured, unresolved, ambiguous or deferred targets return absence. Qualified prefixes, punctuation and comments return absence. Without a current matching report, after close/disposal or outside its text, return absence.
     * Return every current bound final-segment occurrence of that same target identity in this report's requesting source and reachable captured imports/includes. Import source-name references are real occurrences; a use through an alias remains the same target, and another declaration with the same spelling is excluded. Return no unresolved, ambiguous or deferred occurrence as a match. When includeDeclaration is true add that target's exact authored name range once; when false exclude it. An unused source declaration has a present reply with an empty locations list. Every location contains its actual captured source/text and valid scalar range. Deduplicate identical URI/start/end ranges and sort by URI code-unit order, then start/end offset. Returned sources, locations and coverage lists are caller-isolated: mutation cannot alter an earlier or later reply. Requests never traverse Inspection, parse, resolve, compile, read files, scan projects, generate, write or change editor selection.
     * coveredUris is the sorted unique set of exact report.sources URIs inspected for this publication, including captured sources with rejected syntax; it is never a claim that their findings are complete. prerequisites preserves actual syntax explanations, compiler problem codes/messages and deferred requires text, plus each attempted report.dependencies URI absent from report.sources as 'Unavailable source: ' followed by that exact URI. Compiler problems use their actual code followed by ': ' and message; deferred entries use 'Deferred: ' followed by requires; syntax entries use 'Rejected source: ' followed by the primary source URI and explanation. Deduplicate identical entries without inventing requirements. An empty prerequisites list still means only this captured closure was searched. Reverse workspace importers, unrelated unopened files and unavailable source contents are not searched, and no workspace-wide completeness is promised.
     */
    search(uri: string, version: number, offset: number, includeDeclaration: boolean): ReferenceSearch | undefined {
        throw new Error("Not implemented: SourceReferences.search");
    }
    /**
     * Unverified implementation obligation.
     * End this lifetime, clear retained lookups and ignore later publications. All later searches return absence; repeated disposal is harmless. Prepared immutable facts own no files or processes.
     */
    dispose(): void {
        throw new Error("Not implemented: SourceReferences.dispose");
    }
}
