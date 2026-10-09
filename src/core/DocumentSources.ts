import type { SourceDocument } from "./SourceDocument.js";

export interface DocumentSources {
    /**
     * Unverified implementation obligation.
     * Return the current saved text with this exact URI, or absence when unavailable. Do not discover projects, install dependencies or substitute empty text. Unexpected acquisition errors surface. Core overrides this saved snapshot with an open document's unsaved text.
     */
    read(uri: string): SourceDocument | undefined;
}
