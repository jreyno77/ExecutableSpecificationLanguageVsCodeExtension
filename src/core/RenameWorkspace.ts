import type { ConnectionConfiguration } from "./ConnectionConfiguration.js";
import type { RenameBuffer } from "./RenameBuffer.js";


export interface RenameWorkspace {
    /**
     * Unverified implementation obligation.
     * Return the currently selected saved manifest snapshot, or absence. Never invent a default entry, discover a project or substitute an old selection. Use the active saved configuration, not unsaved JSON editor proposals. An unavailable selected manifest is not usable. writable is metadata-save permission and is not rename permission; this operation never edits that manifest. Returned facts are caller-isolated; they do not prove that a generated-output project is connected.
     */
    configuration(): ConnectionConfiguration | undefined;
    /**
     * Unverified implementation obligation.
     * Return a fresh complete snapshot of the current open .expec text documents, including hidden unsaved buffers, with their exact URI/text and actual nonnegative integer version. No duplicate URI or guessed saved version. Closed documents are absent. No writes, parsing, source discovery, generation or editor selection.
     */
    openDocuments(): Array<RenameBuffer>;
}
