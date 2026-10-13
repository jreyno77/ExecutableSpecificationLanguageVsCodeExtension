import type { PreviewPublication } from "./PreviewPublication.js";

export interface PreviewFeedback {
    /**
     * Unverified implementation obligation.
     * Present this complete plain-data view in order. URI/version identify its authored source for the title and observations. Tabs have unique configured IDs, labels, status, ordered UTF-8 documents and any actual explanation. Whole-view message explains absent/invalid configuration or selection. Optional blocked is true only for an actual rejected configuration; it gives the UI a truthful whole-view blocked presentation while all old tabs/documents remain withdrawn. Absence of tabs or a general message is not proof of failure. This accepted view is authoritative; host/UI adapters do not compare report revisions or implement another freshness policy. Keep the latest complete accepted presentation for native ready replay. No model, Specification, native buffer, function or Error crosses transport.
     */
    present(publication: PreviewPublication): void;
}
