import type { SourceDocument } from "./SourceDocument.js";
import type { SourceDefinition } from "./SourceDefinition.js";


export type ReferenceSearch = {
    source: SourceDocument;
    locations: Array<SourceDefinition>;
    coveredUris: Array<string>;
    prerequisites: Array<string>;
};
