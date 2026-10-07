import type { ProjectOutputs } from "./ProjectOutputs.js";
import type { SourceDocument } from "./SourceDocument.js";
import type { OutputTab } from "./OutputTab.js";
export class WorkspaceCore {
    constructor(outputs: ProjectOutputs, generateOnSave: boolean) {
        throw new Error("Not implemented: WorkspaceCore.construction");
    }
    /**
     * Unverified implementation obligation.
     * Ask the connected outputs to preview this exact document and return their tabs unchanged. Do not request generation.
     */
    preview(source: SourceDocument): Array<OutputTab> {
        throw new Error("Not implemented: WorkspaceCore.preview");
    }
    /**
     * Unverified implementation obligation.
     * If generateOnSave is enabled, request generation of this exact document once. Otherwise request nothing. This observes an editor save; it does not save the source file.
     */
    sourceSaved(source: SourceDocument): void {
        throw new Error("Not implemented: WorkspaceCore.sourceSaved");
    }
}
