import type { ConnectionState } from "./ConnectionState.js";
import type { ConnectionConfiguration } from "./ConnectionConfiguration.js";


export interface ConnectionFeedback {
    /**
     * Unverified implementation obligation.
     * Present this immutable current state. Status is unconfigured, checking, connected, unavailable or invalid. Target is the absolute logical configured or currently requested directory. verifiedDirectory is the actual canonical directory from the existing connector, only while connected. Connected establishes valid configuration and usable filesystem identity; it does not establish native build or dependency readiness.
     */
    present(state: ConnectionState): void;
    /**
     * Unverified implementation obligation.
     * Request conditional persistence for this exact captured previous snapshot. This request is not a completed save. Preserve dirty editor work and refuse if actual saved bytes or write safety no longer match previous. Confirm success with the actual saved configurationChanged snapshot, or return this same previous object to saveFailed.
     */
    saveConfiguration(previous: ConnectionConfiguration, text: string): void;
}
