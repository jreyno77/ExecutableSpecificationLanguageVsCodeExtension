/** Number profile: JavaScript binary64. */
export type SourceOutlineSymbol = {
    name: string;
    kind: string;
    startOffset: number;
    endOffset: number;
    nameStartOffset: number;
    nameEndOffset: number;
    children: Array<SourceOutlineSymbol>;
};
