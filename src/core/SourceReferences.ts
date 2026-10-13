import type { SourceDocument } from "./SourceDocument.js";
import type { DocumentReport } from "./DocumentReport.js";
import type { ReferenceSearch } from "./ReferenceSearch.js";
import type { NodeId } from 'executable-specification-language';
import type { SourceDefinition } from './SourceDefinition.js';
import { capturedOrigin, sourceReferenceFacts } from './source-reference-facts.js';

type ReferenceSelector = { start: number; end: number; target: NodeId };
type PreparedReferences = {
    selectors: ReadonlyMap<string, readonly ReferenceSelector[]>;
    declarations: ReadonlyMap<NodeId, SourceDefinition>;
    occurrences: ReadonlyMap<NodeId, readonly SourceDefinition[]>;
    coveredUris: readonly string[];
    prerequisites: readonly string[];
};
type ReferenceDocument = { version: number; source: SourceDocument; length: number; prepared?: PreparedReferences };
const declarationKinds = ['record-type-declaration', 'alias-type-declaration', 'opaque-type-declaration',
    'component', 'concept', 'class', 'interface', 'field', 'parameter', 'type-parameter',
    'capability', 'function', 'setup', 'action', 'observation', 'check', 'fixture'] as const;
/** Number profile: JavaScript binary64. */



/**
 * Unverified implementation obligation.
 * Requires package: expec (runtime)
 * Requires package: typescript (build)
 * Requires package: vitest (test)
 */
export class SourceReferences {
    private readonly documents = new Map<string, ReferenceDocument>();
    private prepared = new WeakMap<DocumentReport, PreparedReferences>();
    private disposed = false;
    constructor() {

    }
    /**
     * Unverified implementation obligation.
     * Receive the same current immutable DocumentAnalysis publication as diagnostics and navigation, including replacement reports at an unchanged editor version after imported edits. Withdraw previous facts before preparing the new publication. Capture exact report.sources and prepare bound occurrences and source declaration name ranges through its one public Inspection, sharing privately prepared reference facts by immutable report identity. Match the actual target NodeId within this same report, never decoded spelling or declaration order. Rejected entry syntax or absent Inspection withdraws earlier results; rejected imported syntax does not silently substitute its previously accepted model. Current bound facts remain useful beside independent problems or deferred requirements. Never parse, resolve, compile, acquire files or make a second model. Invalid noninteger or negative versions throw RangeError before state changes; preparation errors surface after old facts are withdrawn. The caller excludes publications from a previous document lifetime.
     */
    published(source: SourceDocument, version: number, report: DocumentReport): void {
        this.validateInteger(version, 'Document version');
        if (this.disposed) return;
        const captured = { uri: source.uri, text: source.text };
        const document: ReferenceDocument = { version, source: captured, length: Array.from(captured.text).length };
        this.documents.set(captured.uri, document);
        if (!report.inspection || report.syntax.some(problem => problem.primaryRange.sourceId === captured.uri) ||
            !report.sources.some(candidate => candidate.uri === captured.uri && candidate.text === captured.text)) return;
        const prepared = this.prepare(report);
        if (!this.disposed && this.documents.get(captured.uri) === document) document.prepared = prepared;
    }
    /**
     * Unverified implementation obligation.
     * Forget this document's current lookup. Repeated close is harmless; other entries remain usable. Reopening begins a new lifetime and may publish a lower version.
     */
    closed(uri: string): void {
        this.documents.delete(uri);
    }
    /**
     * Unverified implementation obligation.
     * Use only prepared facts for this exact URI/version and zero-based Unicode-scalar cursor. Reject noninteger or negative versions/offsets with RangeError. Select a bound reference's final identifier segment, or a named source declaration's own authored name, whose finite half-open range contains the cursor in the requesting captured source. Supported declarations are record, alias and opaque types, components, concepts, classes, interfaces, fields, parameters, type parameters, capabilities, functions, setup/action/observation helpers, checks and fixtures with an actual source nameOrigin. A wrapper or import alias spelling is not a fabricated declaration. Require the selected target's actual source nameOrigin and exact captured text; builtin, external, unnamed, uncaptured, unresolved, ambiguous or deferred targets return absence. Qualified prefixes, punctuation and comments return absence. Without a current matching report, after close/disposal or outside its text, return absence.
     * Return every current bound final-segment occurrence of that same target identity in this report's requesting source and reachable captured imports/includes. Import source-name references are real occurrences; a use through an alias remains the same target, and another declaration with the same spelling is excluded. Return no unresolved, ambiguous or deferred occurrence as a match. When includeDeclaration is true add that target's exact authored name range once; when false exclude it. An unused source declaration has a present reply with an empty locations list. Every location contains its actual captured source/text and valid scalar range. Deduplicate identical URI/start/end ranges and sort by URI code-unit order, then start/end offset. Returned sources, locations and coverage lists are caller-isolated: mutation cannot alter an earlier or later reply. Requests never traverse Inspection, parse, resolve, compile, read files, scan projects, generate, write or change editor selection.
     * coveredUris is the sorted unique set of exact report.sources URIs inspected for this publication, including captured sources with rejected syntax; it is never a claim that their findings are complete. prerequisites preserves actual syntax explanations, compiler problem codes/messages and deferred requires text, plus each attempted report.dependencies URI absent from report.sources as 'Unavailable source: ' followed by that exact URI. Compiler problems use their actual code followed by ': ' and message; deferred entries use 'Deferred: ' followed by requires; syntax entries use 'Rejected source: ' followed by the primary source URI and explanation. Deduplicate identical entries without inventing requirements. An empty prerequisites list still means only this captured closure was searched. Reverse workspace importers, unrelated unopened files and unavailable source contents are not searched, and no workspace-wide completeness is promised.
     */
    search(uri: string, version: number, offset: number, includeDeclaration: boolean): ReferenceSearch | undefined {
        this.validateInteger(version, 'Document version');
        this.validateInteger(offset, 'Cursor offset');
        const document = this.documents.get(uri);
        if (this.disposed || !document || document.version !== version || offset >= document.length || !document.prepared)
            return undefined;
        const prepared = document.prepared;
        const selector = prepared.selectors.get(uri)?.find(candidate => candidate.start <= offset && offset < candidate.end);
        if (!selector) return undefined;
        const declaration = prepared.declarations.get(selector.target)!;
        const sameRange = (location: SourceDefinition): boolean => location.source.uri === declaration.source.uri &&
            location.startOffset === declaration.startOffset && location.endOffset === declaration.endOffset;
        const locations = (prepared.occurrences.get(selector.target) ?? []).filter(location => !sameRange(location));
        if (includeDeclaration) locations.push(declaration);
        const unique = new Map(locations.map(location => [JSON.stringify([location.source.uri, location.startOffset, location.endOffset]), location]));
        const ordered = [...unique.values()].sort((left, right) => this.compareUri(left.source.uri, right.source.uri) ||
            left.startOffset - right.startOffset || left.endOffset - right.endOffset);
        return { source: { ...document.source }, locations: ordered.map(location => ({ ...location, source: { ...location.source } })),
            coveredUris: [...prepared.coveredUris], prerequisites: [...prepared.prerequisites] };
    }
    /**
     * Unverified implementation obligation.
     * End this lifetime, clear retained lookups and ignore later publications. All later searches return absence; repeated disposal is harmless. Prepared immutable facts own no files or processes.
     */
    dispose(): void {
        this.disposed = true;
        this.documents.clear();
        this.prepared = new WeakMap();
    }
    private validateInteger(value: number, name: string): void {
        if (!Number.isInteger(value) || value < 0) throw new RangeError(name + ' must be a nonnegative integer.');
    }
    private compareUri(left: string, right: string): number {
        return left < right ? -1 : left > right ? 1 : 0;
    }
    private prepare(report: DocumentReport): PreparedReferences {
        const previous = this.prepared.get(report);
        if (previous) return previous;
        const facts = sourceReferenceFacts(report);
        const selectors = new Map<string, ReferenceSelector[]>();
        const declarations = new Map<NodeId, SourceDefinition>();
        const occurrences = new Map<NodeId, SourceDefinition[]>();
        const select = (uri: string, start: number, end: number, target: NodeId): void => {
            const entries = selectors.get(uri) ?? [];
            entries.push({ start, end, target });
            selectors.set(uri, entries);
        };
        for (const kind of declarationKinds) {
            for (const item of report.inspection!.query(kind)) {
                if (item.origin.kind !== 'source' || item.nameOrigin.kind !== 'source' ||
                    item.origin.range.sourceId !== item.nameOrigin.range.sourceId ||
                    item.origin.node.sourceId !== item.origin.range.sourceId ||
                    item.nameOrigin.node.sourceId !== item.nameOrigin.range.sourceId ||
                    !capturedOrigin(item.origin, facts.sources)) continue;
                const captured = capturedOrigin(item.nameOrigin, facts.sources);
                const range = item.nameOrigin.range;
                if (!captured || range.start.offset < item.origin.range.start.offset || range.end.offset > item.origin.range.end.offset)
                    continue;
                declarations.set(item.id, { source: captured.source, startOffset: range.start.offset, endOffset: range.end.offset });
                select(range.sourceId, range.start.offset, range.end.offset, item.id);
            }
        }
        for (const reference of facts.references) {
            if (!declarations.has(reference.target.id)) continue;
            const range = reference.range, captured = facts.sources.get(range.sourceId)!;
            const entries = occurrences.get(reference.target.id) ?? [];
            entries.push({ source: captured.source, startOffset: range.start.offset, endOffset: range.end.offset });
            occurrences.set(reference.target.id, entries);
            select(range.sourceId, range.start.offset, range.end.offset, reference.target.id);
        }
        const coveredUris = [...facts.sources.keys()].sort((left, right) => this.compareUri(left, right));
        const prerequisites = new Set<string>();
        for (const problem of report.syntax)
            prerequisites.add('Rejected source: ' + problem.primaryRange.sourceId + ': ' + problem.explanation);
        for (const problem of report.compilation?.problems ?? []) prerequisites.add(problem.code + ': ' + problem.message);
        for (const requirement of report.compilation?.deferred ?? []) prerequisites.add('Deferred: ' + requirement.requires);
        for (const uri of report.dependencies) if (!facts.sources.has(uri)) prerequisites.add('Unavailable source: ' + uri);
        const prepared = { selectors, declarations, occurrences, coveredUris, prerequisites: [...prerequisites] };
        this.prepared.set(report, prepared);
        return prepared;
    }
}
