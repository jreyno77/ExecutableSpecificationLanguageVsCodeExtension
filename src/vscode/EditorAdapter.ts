import type { WorkspaceCore } from "../core/WorkspaceCore.js";
import type { SourceDocument } from "../core/SourceDocument.js";
import type { OutputTab } from "../core/OutputTab.js";
import type { TextDocument } from "vscode";

/**
 * Unverified implementation obligation.
 * Requires package: typescript (build)
 * Requires package: vscode-types (build)
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
     * For the supplied editor change, capture a new SourceDocument from document.uri.toString() and document.getText() at this call. Pass that snapshot to core.preview once and return core's tabs unchanged. Preserve the full URI for file, untitled and remote documents; do not read files or request a save. Later edits must not change an earlier snapshot.
     */
    documentChanged(document: TextDocument): Array<OutputTab> {
        return this.core.preview(document);
    }
    /**
     * Unverified implementation obligation.
     * For the supplied save notification, capture a new SourceDocument from document.uri.toString() and document.getText() at this call. Pass that snapshot to core.sourceSaved once without requesting a preview or another save. Core owns the generation policy.
     */
    documentSaved(document: TextDocument): void {
        this.core.sourceSaved(document);
    }
}
