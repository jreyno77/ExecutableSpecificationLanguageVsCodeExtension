import type { ConnectionConfiguration } from "./ConnectionConfiguration.js";

export interface ConnectionWorkFeedback {
    /**
     * Unverified implementation obligation.
     * Receive an immutable captured saved configuration only for this controller's current connected selection, or absence when checking a different target, disconnected, deleting metadata, unavailable, invalid, unconfigured or disposed. This controls connection-owned work, independently of authored preview configuration. Absence cancels existing generation admission and clears queued save intents through the existing GenerationHost; it does not erase prior explicit per-manifest opt-in or discard terminal results and partial receipts. Receiving configuration is not a save intent and never starts generation. Preview and live-analysis consumers continue receiving the selected saved metadata through their existing independent boundary.
     */
    configurationChanged(configuration: ConnectionConfiguration | undefined): void;
}
