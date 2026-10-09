import type { SourceDocument } from "./SourceDocument.js";
import type { OutputTab } from "./OutputTab.js";
export interface ProjectOutputs {
    /**
     * Unverified implementation obligation.
     * Use the supplied document text, including unsaved edits, without writing project files. Return one tab per configured output in configuration order, retaining its registration ID and label. This established synchronous seam forwards supplied tabs; EXT-05's native live previews instead receive current DocumentReport publications through OutputPreviews, without another parser or a duplicate live pipeline.
     */
    preview(source: SourceDocument): Array<OutputTab>;
    /**
     * Unverified implementation obligation.
     * Generate from the supplied document through this connection's configured outputs and existing ownership and preservation rules. Never overwrite handwritten work.
     */
    generate(source: SourceDocument): void;
}
