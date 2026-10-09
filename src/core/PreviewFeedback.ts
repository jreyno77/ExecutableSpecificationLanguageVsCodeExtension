import type { PreviewPublication } from "./PreviewPublication.js";

export interface PreviewFeedback {
    /**
     * Unverified implementation obligation.
     * Present this complete plain-data view in order. URI/version identify its authored source for the title and observations. Tabs have unique configured IDs, labels, status, ordered UTF-8 documents and any actual explanation. Whole-view message explains absent/invalid configuration or selection. This accepted view is authoritative; host/UI adapters do not compare report revisions or implement another freshness policy. Keep the latest complete accepted presentation for native ready replay. No model, Specification, native buffer, function or Error crosses transport.
     */
    present(publication: PreviewPublication): void;
}
