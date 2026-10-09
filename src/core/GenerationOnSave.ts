import type { GenerationWorker } from "./GenerationWorker.js";
import type { GenerationFiles } from "./GenerationFiles.js";
import type { GenerationFeedback } from "./GenerationFeedback.js";
import type { ConnectionConfiguration } from "./ConnectionConfiguration.js";
import type { SourceDocument } from "./SourceDocument.js";
/** Number profile: JavaScript binary64. */





/**
 * Unverified implementation obligation.
 * Requires package: expec (runtime)
 * Requires package: node-types (build)
 * Requires package: typescript (build)
 * Requires package: vitest (test)
 */
export class GenerationOnSave {
    constructor(worker: GenerationWorker, files: GenerationFiles, feedback: GenerationFeedback) {
        throw new Error("Not implemented: GenerationOnSave.construction");
    }
    /**
     * Unverified implementation obligation.
     * Capture the selected saved manifest and its explicit opt-in. Absence or a different filename withdraws the prior lifetime; enabled never transfers to another manifest. Missing opt-in means disabled, independently of writable or connected status. Changed selection/text/enablement cancels obsolete work and clears its queue. Never rewrite configuration, install or build merely because configuration or enablement changed.
     */
    configurationChanged(configuration: ConnectionConfiguration | undefined, enabled: boolean): void {
        throw new Error("Not implemented: GenerationOnSave.configurationChanged");
    }
    /**
     * Unverified implementation obligation.
     * Reject a nonpositive or noninteger version with RangeError before changing state. Capture this actual local .expec post-save snapshot. Reject a missing/disabled connection, mismatched actual saved source/configuration bytes or a different current clean buffer, with an explanation and no new worker. Validate through the real registered ConfigurationReader, resolving entries from its actual manifest source URI. A save must belong to an actual configured entry or its saved import closure, established through real saved-source acquisition, public LangiumReader models and SourceComposer composition, not source-name guessing or a single-entry DocumentReport. An unrelated .expec save creates no build. The SDK full build owns remaining prerequisites and invalid compilation findings. Present built only for an actual successful complete build result; preserve actual refused/failed/cancelled findings and partial receipts. Superseded results are recorded but cannot replace current state. Start at most one full saved build for this connection. While it runs, keep only the latest save, cancel the obsolete run and wait for its settlement before starting that latest request after fresh checks. Repeated later saves can retry at the same editor version. Never feed a selected DocumentReport as a full build.
     */
    sourceSaved(source: SourceDocument, version: number): void {
        throw new Error("Not implemented: GenerationOnSave.sourceSaved");
    }
    /**
     * Unverified implementation obligation.
     * Inspect fresh GenerationFiles facts. An edit/close of the triggering source, dirty selected manifest, any observed dirty .expec buffer or dirty ordinary buffer within the actual SDK target root invalidates the pending save and requests cancellation. Logical/canonical root aliases are checked conservatively; uncertain classification is an explained refusal. Unrelated buffer changes create no build. Only sourceSaved creates a generation intent; generated filesystem notifications still reach existing analysis/writer freshness checks without becoming new save intents or being globally muted. Each SDK permission query rechecks current facts.
     */
    editorChanged(): void {
        throw new Error("Not implemented: GenerationOnSave.editorChanged");
    }
    /**
     * Unverified implementation obligation.
     * End this lifetime, clear queued saves and request cancellation once. Start no later work or current-state publication; retain actual terminal effect records. Native ownership uses GenerationWorker.dispose completion to await worker/process cleanup and keep effect recording alive until settlement. No synchronous termination or automatic rollback is promised.
     */
    dispose(): void {
        throw new Error("Not implemented: GenerationOnSave.dispose");
    }
}
