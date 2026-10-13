import type { SourceDocument } from "./SourceDocument.js";
import type { DocumentReport } from "./DocumentReport.js";
import type { TypeCompletion } from "./TypeCompletion.js";
import { typeCandidates } from 'executable-specification-language';
import type { TypeSuggestion } from './TypeSuggestion.js';
import { validSourceRange } from './source-reference-facts.js';

type PreparedToken = { start: number; end: number; token: string; suggestions: readonly TypeSuggestion[] };
type CompletionDocument = { version: number; source: SourceDocument; length: number; tokens: readonly PreparedToken[] };
/** Number profile: JavaScript binary64. */



/**
 * Unverified implementation obligation.
 * Requires package: expec (runtime)
 * Requires package: typescript (build)
 * Requires package: vitest (test)
 */
export class SourceCompletion {
    private readonly documents = new Map<string, CompletionDocument>();
    private disposed = false;
    constructor() {
    }
    /**
     * Unverified implementation obligation.
     * Receive the same current immutable DocumentAnalysis publication used by diagnostics, navigation, hover and outline, including replacement at the same editor version after an imported source changes. Reject negative or noninteger versions before changing state. The caller excludes an earlier document lifetime. Retain this exact source/version. Prepare only current Inspection references whose immediate parent is named-type and whose final segment has a safe single-line source range in this captured requesting text. Ask public typeCandidates with this report's same Resolution and that exact reference id once for each such reference, and read each actual target through this same Inspection. Preserve independently eligible candidates even when other compilation or candidate findings exist; no value for a missing/deferred/invalid qualifier gives no completion. Never enumerate global types to reconstruct resolver visibility, parse, compose, compile, acquire files or install packages. Absent current Inspection/Resolution or rejected entry syntax withdraws old completion facts. A valid current publication withdraws its previous prepared facts before preparation: genuine malformed/foreign Resolution or Inspection caller errors surface through the existing SDK error rather than being swallowed, retried, blended with another report or leaving old facts usable at the same editor version.
     */
    published(source: SourceDocument, version: number, report: DocumentReport): void {
        this.validateInteger(version, 'Document version');
        if (this.disposed) return;
        const captured = Object.freeze({ uri: source.uri, text: source.text });
        const scalars = Array.from(captured.text);
        const document: CompletionDocument = { version, source: captured, length: scalars.length, tokens: [] };
        this.documents.set(captured.uri, document);
        if (!report.inspection || !report.resolution ||
            report.syntax.some(problem => problem.primaryRange.sourceId === captured.uri) ||
            !report.sources.some(candidate => candidate.uri === captured.uri && candidate.text === captured.text)) return;
        const tokens = this.prepare(captured, scalars, report);
        if (!this.disposed && this.documents.get(captured.uri) === document) document.tokens = tokens;
    }
    /**
     * Unverified implementation obligation.
     * Forget only this exact document's prepared completion facts. Repeated close is harmless. A later current publication starts a new lifetime and may use a lower editor version.
     */
    closed(uri: string): void {
        this.documents.delete(uri);
    }
    /**
     * Unverified implementation obligation.
     * Reject negative or noninteger versions/Unicode-scalar offsets with RangeError. Ask only prepared facts for the exact URI/version. Return absence after close/disposal, for a stale version, outside the captured text, without a current named-type final token or without a value from its contextual candidate query. Cursor positions within or immediately after that token are allowed; qualified prefixes, separators, comments, declaration names and values are not contexts. Replace the whole final token's half-open scalar range, including quotes where authored, never the qualifier. Filter eligible decoded names by case-sensitive startsWith of the complete decoded final token, then order by deterministic decoded-name code-unit comparison. Return each exact eligible spelling, the SDK's insertionText, and its actual target's decoded name; aliases keep their eligible spelling distinct from their target name. Empty matching names may give a current reply with an empty list. Do not infer generic arguments, arity correctness, runtime behavior or successful compilation. A request performs no Inspection/query traversal, candidate query, parsing, resolution, compilation, acquisition, generation, disk writes or editor changes.
     */
    completion(uri: string, version: number, offset: number): TypeCompletion | undefined {
        this.validateInteger(version, 'Document version');
        this.validateInteger(offset, 'Cursor offset');
        const document = this.documents.get(uri);
        if (this.disposed || !document || document.version !== version || offset > document.length) return undefined;
        const token = document.tokens.find(candidate => candidate.start <= offset && offset <= candidate.end);
        if (!token) return undefined;
        const suggestions = token.suggestions.filter(suggestion => suggestion.spelling.startsWith(token.token));
        Object.freeze(suggestions);
        return Object.freeze({ source: document.source, startOffset: token.start, endOffset: token.end, suggestions });
    }
    /**
     * Unverified implementation obligation.
     * Clear this completion lifetime and ignore later publications. Queries return absence and repeated disposal is harmless. No files or native resources are owned.
     */
    dispose(): void {
        this.disposed = true;
        this.documents.clear();
    }
    private validateInteger(value: number, name: string): void {
        if (!Number.isInteger(value) || value < 0) throw new RangeError(name + ' must be a nonnegative integer.');
    }
    private prepare(source: SourceDocument, scalars: readonly string[], report: DocumentReport): readonly PreparedToken[] {
        const inspection = report.inspection!, resolution = report.resolution!, tokens: PreparedToken[] = [];
        for (const reference of inspection.query('reference')) {
            if (inspection.parent(reference.id)?.kind !== 'named-type') continue;
            const terminal = reference.segmentOrigins.at(-1), token = reference.segments.at(-1);
            if (reference.origin.kind !== 'source' || terminal?.kind !== 'source' || token === undefined ||
                reference.origin.node.sourceId !== source.uri || terminal.node.sourceId !== source.uri ||
                terminal.range.sourceId !== source.uri || !validSourceRange(terminal.range, scalars.length) ||
                terminal.range.start.line !== terminal.range.end.line) continue;
            const start = terminal.range.start.offset, end = terminal.range.end.offset;
            if (/[\r\n\u2028\u2029]/u.test(scalars.slice(start, end).join(''))) continue;
            const offered = typeCandidates(resolution, reference.id);
            if (offered.value === undefined) continue;
            const suggestions = offered.value.map(candidate => {
                const target = inspection.read(candidate.target);
                if (!('name' in target)) throw new TypeError('A type candidate must name an actual declaration.');
                return Object.freeze({ spelling: candidate.name, insertionText: candidate.insertionText, targetName: target.name });
            });
            suggestions.sort((left, right) => left.spelling < right.spelling ? -1 : left.spelling > right.spelling ? 1 : 0);
            Object.freeze(suggestions);
            tokens.push(Object.freeze({ start, end, token, suggestions }));
        }
        return Object.freeze(tokens);
    }
}
