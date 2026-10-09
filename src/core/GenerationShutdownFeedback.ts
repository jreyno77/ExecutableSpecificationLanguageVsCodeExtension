export interface GenerationShutdownFeedback {
    /**
     * Unverified implementation obligation.
     * Notify once after all owned work has settled, or report the actual cleanup failure and uncertain effects. This callback lets the native entry await shutdown without inventing a synchronous termination guarantee.
     */
    stopped(error: string | undefined): void;
}
