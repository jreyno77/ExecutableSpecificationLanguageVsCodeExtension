import type { GenerationState } from "./GenerationState.js";
import type { GenerationResult } from "./GenerationResult.js";


export interface GenerationFeedback {
    /**
     * Unverified implementation obligation.
     * Present this complete current state. Status is disabled, idle, generating, queued, blocked, built, cancelled or failed. Directory connection and generation outcome remain distinct. Show the actual explanation without claiming rollback or unchanged files from cancellation.
     */
    present(state: GenerationState): void;
    /**
     * Unverified implementation obligation.
     * Retain this actual terminal result even when its save was superseded. report is the unchanged SDK commandJson text, including partial applied/not-applied/uncertain receipts and retained recovery state; runtimeVersion is the actual child process.versions.node when observed; an absent report is empty text, and error preserves actual launch/transport/cleanup failure alongside any report. Do not manufacture a successful report or discard earlier effects.
     */
    record(configurationFile: string, result: GenerationResult): void;
}
