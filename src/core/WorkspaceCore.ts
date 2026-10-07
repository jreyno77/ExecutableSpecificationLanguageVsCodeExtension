import type { ProjectOutputs } from "./ProjectOutputs.js";
import type { SourceDocument } from "./SourceDocument.js";
import type { OutputTab } from "./OutputTab.js";
/**
 * Unverified implementation obligation.
 * Requires package: typescript (build)
 * Requires package: vite (build)
 * Requires package: vitest (test)
 */
export class WorkspaceCore {
    private readonly outputs: ProjectOutputs;
    private readonly generateOnSave: boolean;
    constructor(outputs: ProjectOutputs, generateOnSave: boolean) {
        this.outputs = outputs;
        this.generateOnSave = generateOnSave;
    }
    /**
     * Unverified implementation obligation.
     * Ask the connected outputs to preview this exact document and return their tabs unchanged. Do not request generation.
     */
    preview(source: SourceDocument): Array<OutputTab> {
        return this.outputs.preview(source);
    }
    /**
     * Unverified implementation obligation.
     * If generateOnSave is enabled, request generation of this exact document once. Otherwise request nothing. This observes an editor save; it does not save the source file.
     */
    sourceSaved(source: SourceDocument): void {
        if (this.generateOnSave) this.outputs.generate(source);
    }
}
