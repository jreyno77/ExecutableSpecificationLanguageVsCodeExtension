import type { WorkspaceCore } from "../core/WorkspaceCore.js";
import type { SourceDocument } from "../core/SourceDocument.js";
import type { OutputTab } from "../core/OutputTab.js";
/**
 * Unverified implementation obligation.
 * Requires package: typescript (build)
 * Requires package: vite (build)
 * Requires package: vitest (test)
 */
export class EditorAdapter {
    private readonly core: WorkspaceCore;
    constructor(core: WorkspaceCore) {
        this.core = core;
    }
    /**
     * Unverified implementation obligation.
     * Translate an editor document change into core.preview with the exact URI and current text. Return core's tabs unchanged, without sending a save request.
     */
    documentChanged(source: SourceDocument): Array<OutputTab> {
        return this.core.preview(source);
    }
    /**
     * Unverified implementation obligation.
     * Translate an editor save into core.sourceSaved with the exact URI and saved text. Core owns the generation policy.
     */
    documentSaved(source: SourceDocument): void {
        this.core.sourceSaved(source);
    }
}
