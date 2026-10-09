import type { ConnectionConfiguration } from "./ConnectionConfiguration.js";
import type { SourceDocument } from "./SourceDocument.js";
/** Number profile: JavaScript binary64. */


export type GenerationRequest = {
    configuration: ConnectionConfiguration;
    source: SourceDocument;
    version: number;
};
