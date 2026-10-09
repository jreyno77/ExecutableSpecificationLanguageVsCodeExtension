import { LangiumReader } from 'executable-specification-language';
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
    private readonly reader = new LangiumReader();
    private readonly documents = new Map<string, { source: SourceDocument; version: number }>();
    private readonly feedback: DocumentFeedback;
    constructor(feedback: DocumentFeedback) {
        this.feedback = feedback;
    }
    /**
     * Unverified implementation obligation.
     * Start an open document lifetime and check this exact supplied text using one retained LangiumReader. Publish the real reader problems, or an empty list for syntactically accepted source. Treat the URI as identity, including untitled and remote URIs. Do not read files, resolve imports, generate outputs or require a project connection. Versions are nonnegative integers; reject invalid versions with a RangeError before changing state.
     */
    opened(source: SourceDocument, version: number): void {
        this.validateVersion(version);
        this.check(source, version);
    }
    /**
     * Unverified implementation obligation.
     * Reject a noninteger or negative version with a RangeError before changing state. For an open document, check and publish only a strictly newer version. Ignore duplicate, older and unopened-document changes. Retain the exact snapshot and version for publication. Check that the same lifetime/version is still current before publishing after any reentrant callback. The native caller excludes callbacks from an earlier document lifetime; URI/version alone cannot distinguish those after reopening. Syntax acceptance makes no semantic validity claim. Reader or publication exceptions must surface rather than masquerade as an empty successful result.
     */
    changed(source: SourceDocument, version: number): void {
        this.validateVersion(version);
        const current = this.documents.get(source.uri);
        if (!current || version <= current.version) return;
        this.check(source, version);
    }
    /**
     * Unverified implementation obligation.
     * End this open lifetime and clear its diagnostics. Ignore later changes until the document is opened again; reopening may start with a lower version. Repeated close is harmless. Other documents remain unchanged.
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
}
