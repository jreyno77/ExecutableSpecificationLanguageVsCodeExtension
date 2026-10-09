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
    private readonly documents = new Map<string, { source: SourceDocument; version: number }>();
    private readonly feedback: DocumentFeedback;
    constructor(feedback: DocumentFeedback, sources: DocumentSources) {
        this.feedback = feedback;
    }
    /**
     * Unverified implementation obligation.
     * Start an open document lifetime from this exact supplied snapshot. Use one retained LangiumReader and Compiler; compose accepted source models through the existing SourceComposer. Resolve authored source locators relative to their owner URI and obtain only required source snapshots through DocumentSources. Absolute URIs remain usable; a relative locator without a hierarchical owner, including untitled, remains an unavailable-module finding without guessing a workspace or throwing a URL-base error. Open unsaved text overrides saved text. Cache parsing by exact text, including rejected text; never reuse a previous accepted model after invalid edits. Publish real syntax and compiler findings without generating, installing packages or requiring a project connection. No runtime package facts are invented; unavailable prerequisites remain explicit. Treat URIs as identity. Reject invalid noninteger or negative versions with RangeError before changing state.
     */
    opened(source: SourceDocument, version: number): void {
        this.validateVersion(version);
        this.check(source, version);
    }
    /**
     * Unverified implementation obligation.
     * Reject a noninteger or negative version with a RangeError before changing state. For an open document, check and publish only a strictly newer version. Ignore duplicate, older and unopened-document changes. Retain the exact snapshot and version for publication. Update affected open dependents as well. Check that the same lifetime, version and dependency revision remain current before publishing after reentrant source or feedback callbacks. The native caller excludes callbacks from an earlier document lifetime; URI/version alone cannot distinguish those after reopening. Syntax acceptance makes no semantic validity claim; retain compiler problems and deferred requirements. Reader or publication exceptions must surface rather than masquerade as an empty successful result.
     */
    changed(source: SourceDocument, version: number): void {
        this.validateVersion(version);
        const current = this.documents.get(source.uri);
        if (!current || version <= current.version) return;
        this.check(source, version);
    }
    /**
     * Unverified implementation obligation.
     * End this open lifetime and clear its diagnostics. Ignore later changes until the document is opened again; reopening may start with a lower version. Repeated close is harmless. Imported closed documents fall back to current saved text, and affected open dependents are rechecked. Unrelated documents remain unchanged.
     */
    closed(uri: string): void {
        if (this.documents.delete(uri)) this.feedback.clear(uri);
    }
    private validateVersion(version: number): void {
        if (!Number.isInteger(version) || version < 0) throw new RangeError('Document versions must be nonnegative integers.');
    }
    private check(source: SourceDocument, version: number): void {
        const current = { source: Object.freeze({ uri: source.uri, text: source.text }), version };
        this.documents.set(current.source.uri, current);
        const result = this.reader.read({ sourceId: current.source.uri, text: current.source.text });
        if (this.documents.get(current.source.uri) !== current) return;
        this.feedback.publish(current.source, version, result.status === 'rejected' ? [...result.diagnostics] : []);
    }

/**
     * Unverified implementation obligation.
     * Invalidate a requested saved source after creation, change or deletion and recheck affected open entries even when their editor version is unchanged. Ignore unrelated URIs and saved changes hidden by an authoritative open snapshot. Reuse unchanged parsed snapshots and read only the invalidated source plus newly required imports. Track missing imports too, and terminate cyclic import acquisition. Preserve other documents and previous reports; do not let reentrant older work replace current feedback.
     */
sourceChanged(uri: string): void {
        throw new Error("Not implemented: DocumentAnalysis.sourceChanged");
    }
}
