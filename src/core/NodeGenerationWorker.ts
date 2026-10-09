import type { GenerationRequest } from "./GenerationRequest.js";
import type { GenerationRunFeedback } from "./GenerationRunFeedback.js";
import type { GenerationShutdownFeedback } from "./GenerationShutdownFeedback.js";



/**
 * Unverified implementation obligation.
 * Requires package: expec (runtime)
 * Requires package: node-types (build)
 * Requires package: typescript (build)
 * Requires package: vite (build)
 * Requires package: vitest (test)
 */
export class NodeGenerationWorker {
    constructor(nodeExecutable: string, entry: string) {
        throw new Error("Not implemented: NodeGenerationWorker.construction");
    }
    /**
     * Unverified implementation obligation.
     * Spawn the supplied packaged entry without a shell using this explicit Node executable or workspace PATH node. Never substitute Electron process.execPath or download a runtime. Admit the actual child version only when compatible with the pinned SDK's declared Node range; retain actual launch/version errors. Verify readiness per child lifetime. The entry imports the shipped pinned SDK with its original module-relative asset roots and calls public runCli with build --config the exact absolute saved manifest --json and PROJECT-42 CliHost signal/stdout/stderr/asynchronous checkWrite. Forward actual root checks over owned plain IPC and map refusals to actual located Diagnostic values. Carry the actual child runtimeVersion separately from unchanged SDK JSON, including rejected versions. The SDK owns full entries, target order, preservation, journal recovery and native/disk guards. No CLI copy, temporary manifest, selected-entry Compilation, init or install.
     */
    start(request: GenerationRequest, feedback: GenerationRunFeedback): void {
        throw new Error("Not implemented: NodeGenerationWorker.start");
    }
    /**
     * Unverified implementation obligation.
     * Send cooperative cancellation over owned child IPC to its CliHost AbortController. Never treat Windows child.kill(SIGINT) as graceful cancellation. Observe pending permission replies and process failure; do not allow a later reply to initiate application. Keep actual partial/uncertain receipts, not a rollback claim.
     */
    cancel(): void {
        throw new Error("Not implemented: NodeGenerationWorker.cancel");
    }
    /**
     * Unverified implementation obligation.
     * Stop accepting work, request cancellation once and drain owned callbacks, IPC and child process before notifying completion. Attempt remaining cleanup after failure and preserve every actual cause. If force cleanup is necessary, explicitly record uncertain effects and cleanup failure. Repeated callers join this one shutdown.
     */
    dispose(completion: GenerationShutdownFeedback): void {
        throw new Error("Not implemented: NodeGenerationWorker.dispose");
    }
}
