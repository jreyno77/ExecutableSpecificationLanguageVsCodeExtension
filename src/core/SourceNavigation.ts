import type { SourceRange } from 'executable-specification-language';

type PreparedDefinition = { start: number; end: number; target: SourceDefinition };
type PreparedDocument = { version: number; length: number; definitions: PreparedDefinition[] };

import type { SourceDocument } from "./SourceDocument.js";
import type { DocumentReport } from "./DocumentReport.js";
import type { SourceDefinition } from "./SourceDefinition.js";
/** Number profile: JavaScript binary64. */



/**
 * Unverified implementation obligation.
 * Requires package: expec (runtime)
 * Requires package: typescript (build)
 * Requires package: vitest (test)
 */
export class SourceNavigation {
    private readonly documents = new Map<string, PreparedDocument>();
    private disposed = false;
    constructor() {

    }
    /**
     * Unverified implementation obligation.
     * Receive only current immutable DocumentAnalysis publications from the same live analysis, including replacement reports at the same editor version after dependency changes. Capture the supplied source/version and exact report.sources; prepare a lookup from the current public Inspection once per publication. This Inspection holds the existing SourceComposer's resolution facts and is not a checked Specification or a claim of whole-compilation success. Bound references remain usable when independent semantic problems or deferred requirements exist elsewhere. Rejected entry syntax has no Inspection and withdraws old targets. Never parse, resolve, compile, discover files or read saved text here; no previous accepted model substitutes for the current publication. Invalid noninteger or negative versions throw RangeError before changing state.
     */
    published(source: SourceDocument, version: number, report: DocumentReport): void {
        this.validateInteger(version, 'Document version');
        if (this.disposed) return;
        const length = Array.from(source.text).length;
        const definitions: PreparedDefinition[] = [];
        const sources = new Map(report.sources.map(captured => [captured.uri,
            { source: Object.freeze({ uri: captured.uri, text: captured.text }), length: Array.from(captured.text).length }]));
        const inspection = report.inspection;
        if (inspection && sources.get(source.uri)?.source.text === source.text) {
            for (const reference of inspection.query('reference')) {
                const origin = reference.segmentOrigins.at(-1);
                if (origin?.kind !== 'source' || origin.range.sourceId !== source.uri ||
                    !this.validRange(origin.range, length) || reference.resolution.status !== 'bound') continue;
                const target = inspection.read(reference.resolution.target);
                if (!('nameOrigin' in target) || target.nameOrigin.kind !== 'source') continue;
                const range = target.nameOrigin.range;
                const captured = sources.get(range.sourceId);
                if (!captured || !this.validRange(range, captured.length)) continue;
                definitions.push({ start: origin.range.start.offset, end: origin.range.end.offset,
                    target: { source: captured.source, startOffset: range.start.offset, endOffset: range.end.offset } });
            }
        }
        this.documents.set(source.uri, { version, length, definitions });
    }
    /**
     * Unverified implementation obligation.
     * Forget this document's report and lookup when DocumentAnalysis ends its lifetime. Repeated close is harmless. A later current publication after reopening starts a new lifetime and may have a lower version. Other documents remain usable.
     */
    closed(uri: string): void {
        this.documents.delete(uri);
    }
    /**
     * Unverified implementation obligation.
     * Ask the retained current report for this exact URI/version and zero-based Unicode-scalar cursor offset. Reject negative or noninteger versions/offsets with RangeError. Without a current matching report, after close/disposal, outside its captured text or without current Inspection, return absence. Navigate only a source reference's final identifier segment whose half-open name range contains the cursor and whose public resolution is bound. Qualified prefixes have no independent SDK binding and return absence. Read the actual bound target through that same Inspection and require its source nameOrigin and exact captured target text; return that authored name range and text, without guessing from spelling or declaration order. Unresolved, ambiguous, deferred, builtin/external, unnamed or uncaptured targets, declaration names, comments and punctuation return absence. A query performs no parsing, resolution, compilation, acquisition or project scan; reuse the prepared lookup. This operation never writes, generates or changes editor selection.
     */
    definition(uri: string, version: number, offset: number): SourceDefinition | undefined {
        this.validateInteger(version, 'Document version');
        this.validateInteger(offset, 'Cursor offset');
        const document = this.documents.get(uri);
        if (this.disposed || !document || document.version !== version || offset >= document.length) return undefined;
        const found = document.definitions.find(definition => definition.start <= offset && offset < definition.end);
        return found ? { ...found.target } : undefined;
    }
    /**
     * Unverified implementation obligation.
     * End this navigation lifetime, clear retained reports/lookups and ignore later publications. All queries return absence; repeated disposal is harmless.
     */
    dispose(): void {
        this.disposed = true;
        this.documents.clear();
    }
    private validateInteger(value: number, name: string): void {
        if (!Number.isInteger(value) || value < 0) throw new RangeError(name + ' must be a nonnegative integer.');
    }
    private validRange(range: SourceRange, length: number): boolean {
        return Number.isInteger(range.start.offset) && Number.isInteger(range.end.offset) &&
            range.start.offset >= 0 && range.end.offset > range.start.offset && range.end.offset <= length;
    }
}
