import type { GenerationBuffer } from "./GenerationBuffer.js";

export interface GenerationFiles {
    /**
     * Unverified implementation obligation.
     * Return a complete new snapshot of all ordinary file text documents currently open in the editor, including hidden buffers, with actual URI/version/text/dirty facts. Closed documents are absent. No source parsing, output inference or cached permission result.
     */
    buffers(): Array<GenerationBuffer>;
}
