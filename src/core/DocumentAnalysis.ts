import { Compiler, LangiumModel, QueryInspection, SourceComposer, type ModuleModel, type ReadResult } from 'executable-specification-language';
import type { DocumentReport } from './DocumentReport.js';

type OpenDocument = { source: SourceDocument; version: number; revision: number; dependencies: Set<string>; pending?: Set<string> };
type ParsedSource = { source: SourceDocument; result: ReadResult; model?: ModuleModel };
const obsoleteAnalysis = Symbol('obsolete document analysis');

import { LangiumReader } from 'executable-specification-language';
import type { DocumentFeedback } from "./DocumentFeedback.js";
import type { SourceDocument } from "./SourceDocument.js";
import type { DocumentSources } from "./DocumentSources.js";

/** Number profile: JavaScript binary64. */


/**
 * Unverified implementation obligation.
 * Requires package: expec (runtime)
 * Requires package: typescript (build)
 * Requires package: vitest (test)
 */
export class DocumentAnalysis {
    private readonly reader = new LangiumReader();
    private readonly compiler = new Compiler();
    private readonly composer = new SourceComposer((owner, authored) => this.locate(owner, authored));
    private readonly documents = new Map<string, OpenDocument>();
    private readonly parsed = new Map<string, ParsedSource>();
    private readonly saved = new Map<string, SourceDocument | undefined>();
    private readonly sources: DocumentSources;
    private readonly feedback: DocumentFeedback;
    constructor(feedback: DocumentFeedback, sources: DocumentSources) {
        this.feedback = feedback;
        this.sources = sources;
    }
    /**
     * Unverified implementation obligation.
     * Start an open document lifetime from this exact supplied snapshot. Use one retained LangiumReader and Compiler; compose accepted source models through the existing SourceComposer. Resolve authored source locators relative to their owner URI and obtain only required source snapshots through DocumentSources. Absolute URIs remain usable; a relative locator without a hierarchical owner, including untitled, remains an unavailable-module finding without guessing a workspace or throwing a URL-base error. Open unsaved text overrides saved text. Cache parsing by exact text, including rejected text; never reuse a previous accepted model after invalid edits. Publish real syntax and compiler findings without generating, installing packages or requiring a project connection. No runtime package facts are invented; unavailable prerequisites remain explicit. Treat URIs as identity. Reject invalid noninteger or negative versions with RangeError before changing state.
     */
    opened(source: SourceDocument, version: number): void {
        this.validateVersion(version);
        this.update(source, version);
    }
    /**
     * Unverified implementation obligation.
     * Reject a noninteger or negative version with a RangeError before changing state. For an open document, check and publish only a strictly newer version. Ignore duplicate, older and unopened-document changes. Retain the exact snapshot and version for publication. Update affected open dependents as well. Check that the same lifetime, version and dependency revision remain current before publishing after reentrant source or feedback callbacks. The native caller excludes callbacks from an earlier document lifetime; URI/version alone cannot distinguish those after reopening. Syntax acceptance makes no semantic validity claim; retain compiler problems and deferred requirements. Reader or publication exceptions must surface rather than masquerade as an empty successful result.
     */
    changed(source: SourceDocument, version: number): void {
        this.validateVersion(version);
        const current = this.documents.get(source.uri);
        if (!current || version <= current.version) return;
        this.update(source, version);
    }
    /**
     * Unverified implementation obligation.
     * End this open lifetime and clear its diagnostics. Ignore later changes until the document is opened again; reopening may start with a lower version. Repeated close is harmless. Imported closed documents fall back to current saved text, and affected open dependents are rechecked. Unrelated documents remain unchanged.
     */
    closed(uri: string): void {
        if (!this.documents.delete(uri)) return;
        this.saved.delete(uri);
        const affected = this.affected(uri);
        this.feedback.clear(uri);
        this.run(affected);
    }
    private validateVersion(version: number): void {
        if (!Number.isInteger(version) || version < 0) throw new RangeError('Document versions must be nonnegative integers.');
    }
    private update(source: SourceDocument, version: number): void {
        const current: OpenDocument = {
            source: this.capture(source), version, revision: 0,
            dependencies: this.documents.get(source.uri)?.dependencies ?? new Set(),
        };
        this.documents.set(current.source.uri, current);
        this.run(this.affected(current.source.uri, current));
    }
    private affected(uri: string, own?: OpenDocument): Array<{ document: OpenDocument; revision: number }> {
        return [...this.documents.values()]
            .filter(document => document === own || document.dependencies.has(uri) || document.pending?.has(uri))
            .map(document => ({ document, revision: ++document.revision }));
    }
    private run(affected: Array<{ document: OpenDocument; revision: number }>): void {
        try {
            for (const { document, revision } of affected) {
                if (this.current(document, revision)) this.check(document, revision);
            }
        } finally { this.prune(); }
    }
    private prune(): void {
        const retained = new Set(this.documents.keys());
        for (const document of this.documents.values()) {
            for (const uri of document.dependencies) retained.add(uri);
            for (const uri of document.pending ?? []) retained.add(uri);
        }
        for (const uri of this.saved.keys()) if (!retained.has(uri)) this.saved.delete(uri);
        for (const uri of this.parsed.keys()) if (!retained.has(uri)) this.parsed.delete(uri);
    }
    private current(document: OpenDocument, revision: number): boolean {
        return this.documents.get(document.source.uri) === document && document.revision === revision;
    }
    private capture(source: SourceDocument): SourceDocument {
        return Object.freeze({ uri: source.uri, text: source.text });
    }
    private locate(owner: string, authored: string): string | undefined {
        try { return new URL(authored, owner).href; }
        catch (error) { if (error instanceof TypeError) return undefined; throw error; }
    }
    private parse(source: SourceDocument, current: () => void): ParsedSource {
        const cached = this.parsed.get(source.uri);
        if (cached?.source.text === source.text) return cached;
        const captured = this.capture(source);
        const result = this.reader.read({ sourceId: captured.uri, text: captured.text });
        current();
        const parsed: ParsedSource = { source: captured, result,
            ...(result.status === 'accepted' ? { model: new LangiumModel(captured.uri, result.document) } : {}) };
        this.parsed.set(captured.uri, parsed);
        return parsed;
    }
    private imported(model: ModuleModel): Set<string> {
        const authored = [
            ...model.nodes('use').map(node => model.node(node.locator, 'string-literal').value),
            ...model.nodes('include').map(node => model.node(node.locator, 'string-literal').value),
            ...model.nodes('examples-attachment').map(node => model.node(node.locator, 'string-literal').value),
            ...model.nodes('reference').flatMap(node => node.lookup?.kind === 'module' ? [node.lookup.locator] : []),
        ];
        return new Set(authored.flatMap(locator => {
            const uri = this.locate(model.locator, locator);
            return uri === undefined ? [] : [uri];
        }));
    }
    private savedSource(uri: string, current: () => void): SourceDocument | undefined {
        const open = this.documents.get(uri);
        if (open) return open.source;
        if (this.saved.has(uri)) return this.saved.get(uri);
        const source = this.sources.read(uri);
        current();
        if (source !== undefined && source.uri !== uri) throw new TypeError('DocumentSources returned a different source URI.');
        const captured = source === undefined ? undefined : this.capture(source);
        this.saved.set(uri, captured);
        return captured;
    }
    private check(document: OpenDocument, revision: number): void {
        const dependencies = new Set<string>();
        document.pending = dependencies;
        const current = () => { if (!this.current(document, revision)) throw obsoleteAnalysis; };
        try {
            const entry = this.parse(document.source, current);
            const captures = new Map<string, ParsedSource>([[entry.source.uri, entry]]);
            const visit = (parsed: ParsedSource): void => {
                if (!parsed.model) return;
                for (const uri of this.imported(parsed.model)) {
                    dependencies.add(uri);
                    if (captures.has(uri)) continue;
                    const source = this.savedSource(uri, current);
                    if (source === undefined) continue;
                    const imported = this.parse(source, current);
                    captures.set(uri, imported);
                    visit(imported);
                }
            };
            visit(entry);
            current();
            const models = [...captures.values()].flatMap(parsed => parsed.model ? [parsed.model] : []);
            const resolution = entry.model
                ? this.composer.compose(entry.model, { modules: models.slice(1), packages: [] }) : undefined;
            const compilation = resolution ? this.compiler.compile({ resolution }) : undefined;
            const inspection = resolution ? new QueryInspection(resolution.model) : undefined;
            current();
            const report: DocumentReport = {
                syntax: [...captures.values()].flatMap(parsed => parsed.result.status === 'rejected' ? [...parsed.result.diagnostics] : []),
                ...(compilation === undefined ? {} : { compilation }),
                ...(inspection === undefined ? {} : { inspection }),
                ...(resolution === undefined ? {} : { resolution }),
                sources: [...captures.values()].map(parsed => parsed.source), dependencies: [...dependencies],
            };
            Object.freeze(report.syntax);
            Object.freeze(report.sources);
            Object.freeze(report.dependencies);
            Object.freeze(report);
            document.dependencies = dependencies;
            document.pending = undefined;
            this.feedback.publish(document.source, document.version, report);
        } catch (error) { if (error !== obsoleteAnalysis) throw error; }
        finally { if (document.pending === dependencies) document.pending = undefined; }
    }

/**
     * Unverified implementation obligation.
     * Invalidate a requested saved source after creation, change or deletion and recheck affected open entries even when their editor version is unchanged. Ignore unrelated URIs and saved changes hidden by an authoritative open snapshot. Reuse unchanged parsed snapshots and read only the invalidated source plus newly required imports. Track missing imports too, and terminate cyclic import acquisition. Preserve other documents and previous reports; do not let reentrant older work replace current feedback.
     */
sourceChanged(uri: string): void {
        if (this.documents.has(uri)) return;
        const affected = this.affected(uri);
        if (!affected.length) return;
        this.saved.delete(uri);
        this.run(affected);
    }
}
