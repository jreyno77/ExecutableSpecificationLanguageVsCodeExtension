import type { ConnectionConfiguration } from "./ConnectionConfiguration.js";
import type { ConnectionOutputGuidance } from "./ConnectionOutputGuidance.js";


export type ConnectionGuidance = {
    configuration: ConnectionConfiguration;
    requiresEntries: boolean;
    hasProject: boolean;
    outputs: Array<ConnectionOutputGuidance>;
};
