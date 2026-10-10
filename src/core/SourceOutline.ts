import type { SourceDocument } from "./SourceDocument.js";
import type { SourceOutlineSymbol } from "./SourceOutlineSymbol.js";


export type SourceOutline = {
    source: SourceDocument;
    symbols: Array<SourceOutlineSymbol>;
};
