import type { GenerationRequest } from "./GenerationRequest.js";
import type { GenerationRunFeedback } from "./GenerationRunFeedback.js";
import type { GenerationShutdownFeedback } from "./GenerationShutdownFeedback.js";



export interface GenerationWorker {
    /**
     * Unverified implementation obligation.
     * Start one owned full saved build and deliver its actual terminal result through this feedback. Reject overlapping starts or starts after disposal. Runtime, SDK invocation and process ownership are implemented by NodeGenerationWorker, not by a replacement generation pipeline.
     */
    start(request: GenerationRequest, feedback: GenerationRunFeedback): void;
    /**
     * Unverified implementation obligation.
     * Request cooperative cancellation of the owned invocation. Cancellation cannot preempt synchronous analysis or undo an in-flight write.
     */
    cancel(): void;
    /**
     * Unverified implementation obligation.
     * Reject future starts, request cancellation and notify completion after owned cleanup. Keep started callbacks observed. Cleanup failure reports its actual cause and uncertain effects instead of claiming a clean stop. Repeated disposal joins the same shutdown.
     */
    dispose(completion: GenerationShutdownFeedback): void;
}
