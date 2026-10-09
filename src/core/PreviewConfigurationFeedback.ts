import type { ConnectionConfiguration } from "./ConnectionConfiguration.js";

export interface PreviewConfigurationFeedback {
    /**
     * Unverified implementation obligation.
     * Forward the current selected saved manifest snapshot or absence, preserving its absolute filename/text and selection lifetime. Dirty manifest editing retains its saved snapshot policy. Switching away from a selected local manifest withdraws the prior snapshot. This event grants no permission to write, capture targets or claim connection/generation readiness.
     */
    configurationChanged(configuration: ConnectionConfiguration | undefined): void;
}
