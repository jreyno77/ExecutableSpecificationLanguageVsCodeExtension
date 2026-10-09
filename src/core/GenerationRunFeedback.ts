import type { GenerationWriteProblem } from "./GenerationWriteProblem.js";
import type { GenerationResult } from "./GenerationResult.js";


export interface GenerationRunFeedback {
    /**
     * Unverified implementation obligation.
     * For this actual absolute project root, recheck the current save/connection lifetime, saved source/configuration bytes and fresh editor facts. Refuse a dirty selected manifest, any observed dirty .expec buffer in this workbench, or any dirty ordinary buffer within this logical/canonical target root. This conservative authored-input policy covers other entries/imports outside the target until precise SDK input membership is available. Explain uncertain alias/root classification rather than approve it. This is a point-in-time observation, not an editor/filesystem transaction.
     */
    writeProblems(root: string): Array<GenerationWriteProblem>;
    /**
     * Unverified implementation obligation.
     * Report this invocation once after its owned process and permission IPC work have settled or cleanup failure is explicitly reported. Preserve actual JSON and exit/launch evidence. Never let a cancelled permission callback initiate later application.
     */
    finished(result: GenerationResult): void;
}
