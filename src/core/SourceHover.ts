import type { SourceDocument } from "./SourceDocument.js";
import type { DocumentReport } from "./DocumentReport.js";
import type { DeclarationHover } from "./DeclarationHover.js";
import type { Item, NodeId } from 'executable-specification-language';
import { capturedOrigin, sourceReferenceFacts, type CapturedSource } from './source-reference-facts.js';

type PreparedHover = { start: number; end: number; signature: string; description: string };
type HoverDocument = { version: number; source: SourceDocument; length: number; hovers: readonly PreparedHover[] };
type DeclarationContent = { signature: string; description: string };
const declarationKinds = ['capability', 'function', 'setup', 'action', 'observation', 'check',
    'alias-type-declaration', 'opaque-type-declaration', 'record-type-declaration',
    'component', 'concept', 'class', 'interface', 'field', 'parameter'] as const;
/** Number profile: JavaScript binary64. */



/**
 * Unverified implementation obligation.
 * Requires package: expec (runtime)
 * Requires package: typescript (build)
 * Requires package: vitest (test)
 */
export class SourceHover {
    private readonly documents = new Map<string, HoverDocument>();
    private readonly prepared = new WeakMap<DocumentReport, ReadonlyMap<string, readonly PreparedHover[]>>();
    private disposed = false;
    constructor() {
    }
    /**
     * Unverified implementation obligation.
     * Receive only current immutable DocumentAnalysis publications from the same analysis as diagnostics and navigation, including replacement reports at the same editor version after imported text changes. Capture this exact source/version and report.sources. Prepare readable hover facts from this report's public Inspection once per publication; privately shared prepared reference facts may be cached by immutable report identity with SourceNavigation. Do not parse, resolve, compile, discover files, acquire saved text or create another declaration model. Current bound facts remain useful despite independent compiler problems or deferred requirements; they do not establish a checked Specification. Rejected entry syntax has no Inspection and withdraws previous hovers. Invalid noninteger or negative versions throw RangeError before state changes. The caller excludes publications from a previous document lifetime.
     */
    published(source: SourceDocument, version: number, report: DocumentReport): void {
        this.validateInteger(version, 'Document version');
        if (this.disposed) return;
        const facts = sourceReferenceFacts(report), captured = facts.sources.get(source.uri);
        const hovers = report.inspection && captured?.source.text === source.text
            ? this.prepare(report).get(source.uri) ?? [] : [];
        this.documents.set(source.uri, { version, source: Object.freeze({ uri: source.uri, text: source.text }),
            length: Array.from(source.text).length, hovers });
    }
    /**
     * Unverified implementation obligation.
     * Forget the exact document's current report and prepared hovers. Repeated close is harmless; other documents remain usable. A current publication after reopening starts a new lifetime and may have a lower editor version.
     */
    closed(uri: string): void {
        this.documents.delete(uri);
    }
    /**
     * Unverified implementation obligation.
     * Ask the prepared current report for this exact URI/version and zero-based Unicode-scalar offset. Reject noninteger or negative versions/offsets with RangeError. Return absence without a matching current report, after close/disposal, outside the captured text or without Inspection. Select only a bound reference's final identifier segment, or a supported source declaration's own authored name, when its half-open range contains the cursor. Qualified prefixes, punctuation, comments, unresolved, ambiguous or deferred references return absence. The reply.source is the exact captured requesting text, and reply offsets select that referring or declaration name token. Read bound targets through the same Inspection and require their exact captured source text; source-free external targets, unsupported declarations or unsafe/missing ranges return absence. A bound builtin reference instead shows its exact SDK builtin name with an empty description, without inventing source or an implementation.
     * For source capabilities, functions, setup/action/observation helpers and checks, show the exact authored header from origin.start to an available body's content.origin.start, excluding its opening brace; when the body is absent use the finite whole declaration origin. Remove trailing whitespace only. The description contains only this callable's own decoded promises.text members of its contract body in source order, joined by one blank line; no promises means an empty description. This is the declared signature, not an inferred type or a claim that every signature type is valid. Alias and opaque type declarations use their finite whole authored origin. Record types, components, concepts, classes and interfaces use the brief actual prefix through nameOrigin.end, explicitly omitting generic lists and bodies. Fields and parameters use their finite whole authored origin, including a declared default. Do not dump container bodies, guess a header delimiter, reconstruct generics or attach another declaration's promises. A request only reads prepared facts; it performs no Inspection traversal, parsing, resolution, compilation, acquisition, generation, writes or editor changes.
     */
    hover(uri: string, version: number, offset: number): DeclarationHover | undefined {
        this.validateInteger(version, 'Document version');
        this.validateInteger(offset, 'Cursor offset');
        const document = this.documents.get(uri);
        if (this.disposed || !document || document.version !== version || offset >= document.length) return undefined;
        const found = document.hovers.find(hover => hover.start <= offset && offset < hover.end);
        return found ? { source: document.source, startOffset: found.start, endOffset: found.end,
            signature: found.signature, description: found.description } : undefined;
    }
    /**
     * Unverified implementation obligation.
     * End this hover lifetime, clear retained reports/lookups and ignore later publications. Subsequent queries return absence. Repeated disposal is harmless; immutable shared preparation owns no files or native resources.
     */
    dispose(): void {
        this.disposed = true;
        this.documents.clear();
    }
    private validateInteger(value: number, name: string): void {
        if (!Number.isInteger(value) || value < 0) throw new RangeError(name + ' must be a nonnegative integer.');
    }
    private prepare(report: DocumentReport): ReadonlyMap<string, readonly PreparedHover[]> {
        const previous = this.prepared.get(report);
        if (previous) return previous;
        const facts = sourceReferenceFacts(report), hovers = new Map<string, PreparedHover[]>();
        const contents = new Map<NodeId, DeclarationContent | undefined>();
        const content = (item: Item): DeclarationContent | undefined => {
            if (!contents.has(item.id)) contents.set(item.id, this.describe(item, facts.sources));
            return contents.get(item.id);
        };
        const add = (uri: string, start: number, end: number, declaration: DeclarationContent): void => {
            const entries = hovers.get(uri) ?? [];
            entries.push({ start, end, ...declaration });
            hovers.set(uri, entries);
        };
        for (const reference of facts.references) {
            const declaration = reference.target.kind === 'builtin-type' && reference.target.origin.kind === 'builtin'
                ? { signature: reference.target.name, description: '' } : content(reference.target);
            if (declaration) add(reference.range.sourceId, reference.range.start.offset, reference.range.end.offset, declaration);
        }
        if (report.inspection) {
            for (const kind of declarationKinds) {
                for (const item of report.inspection.query(kind)) {
                    if (item.nameOrigin.kind !== 'source' || !capturedOrigin(item.nameOrigin, facts.sources)) continue;
                    const declaration = content(item), range = item.nameOrigin.range;
                    if (declaration) add(range.sourceId, range.start.offset, range.end.offset, declaration);
                }
            }
        }
        this.prepared.set(report, hovers);
        return hovers;
    }
    private describe(item: Item, sources: ReadonlyMap<string, CapturedSource>): DeclarationContent | undefined {
        if (item.origin.kind !== 'source') return undefined;
        const captured = capturedOrigin(item.origin, sources);
        if (!captured || !('nameOrigin' in item) || item.nameOrigin.kind !== 'source' ||
            item.nameOrigin.range.sourceId !== item.origin.range.sourceId || !capturedOrigin(item.nameOrigin, sources)) return undefined;
        const range = item.origin.range;
        if (item.nameOrigin.range.start.offset < range.start.offset || item.nameOrigin.range.end.offset > range.end.offset)
            return undefined;
        let end = range.end.offset, description = '';
        switch (item.kind) {
            case 'capability': case 'function': case 'setup': case 'action': case 'observation': case 'check': {
                const body = item.body;
                if (body.kind === 'unavailable') return undefined;
                if (body.kind === 'available') {
                    const origin = body.content.origin;
                    if (origin.kind !== 'source' || origin.range.sourceId !== range.sourceId ||
                        !capturedOrigin(origin, sources) || origin.range.start.offset <= range.start.offset ||
                        origin.range.end.offset > range.end.offset) return undefined;
                    end = origin.range.start.offset;
                    if (body.content.kind === 'contract-body')
                        description = body.content.members.filter(member => member.kind === 'promises')
                            .map(member => member.text).join('\n\n');
                }
                break;
            }
            case 'record-type-declaration': case 'component': case 'concept': case 'class': case 'interface':
                end = item.nameOrigin.range.end.offset;
                break;
            case 'alias-type-declaration': case 'opaque-type-declaration': case 'field': case 'parameter':
                break;
            default: return undefined;
        }
        if (end < item.nameOrigin.range.end.offset || end > range.end.offset) return undefined;
        const signature = captured.scalars.slice(range.start.offset, end).join('').trimEnd();
        return signature ? { signature, description } : undefined;
    }
}
