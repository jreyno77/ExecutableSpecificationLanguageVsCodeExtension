import type { SourceDocument } from "./SourceDocument.js";
import type { TypeSuggestion } from "./TypeSuggestion.js";
/** Number profile: JavaScript binary64. */


export type TypeCompletion = {
    source: SourceDocument;
    startOffset: number;
    endOffset: number;
    suggestions: Array<TypeSuggestion>;
};
