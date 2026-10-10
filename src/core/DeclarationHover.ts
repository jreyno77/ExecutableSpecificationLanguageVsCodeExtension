import type { SourceDocument } from "./SourceDocument.js";
/** Number profile: JavaScript binary64. */

export type DeclarationHover = {
    source: SourceDocument;
    startOffset: number;
    endOffset: number;
    signature: string;
    description: string;
};
