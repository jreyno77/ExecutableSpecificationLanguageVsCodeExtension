import type { SourceDocument } from "./SourceDocument.js";
import type { RenameTextEdit } from "./RenameTextEdit.js";
/** Number profile: JavaScript binary64. */


export type RenameDocumentEdit = {
    source: SourceDocument;
    version?: number | undefined;
    edits: Array<RenameTextEdit>;
};
