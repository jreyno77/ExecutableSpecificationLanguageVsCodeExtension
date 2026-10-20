export interface SourceIdentities {
    /**
     * Unverified implementation obligation.
     * Return the current opaque physical source identity within this selected manifest, or absence when native facts cannot establish it. Equal known keys establish the same actual file; different known keys establish different actual files in this capture. The provider owns filesystem observation and ancestry checks; core receives no native handles or filesystem APIs. Never derive a key from URI spelling, decoded or case-folded strings, localPath, source text or declaration names. Keys are only equality facts for the current capture, never persistent or cross-project identifiers. A native file that has never been saved may have no identity: preserve absence so rename can explain its actual URI and ask the author to save first. No project scan, package capture, parsing, generation or writes. Unexpected provider errors surface. Return current facts on every query so the caller can recheck all acquired and routed source identities before returning a plan.
     */
    keyOf(uri: string, manifestFile: string): string | undefined;
}
