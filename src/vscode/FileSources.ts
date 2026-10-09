import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SourceDocument } from "../core/SourceDocument.js";

/**
 * Unverified implementation obligation.
 * Requires package: node-types (build)
 * Requires package: typescript (build)
 */
export class FileSources {
    /**
     * Unverified implementation obligation.
     * Adapt a local file URI to its current UTF-8 saved text for DocumentSources. Missing files and unsupported URI schemes return absence. Other filesystem errors surface. Do not scan folders, acquire packages, cache business state or replace open editor text.
     */
    read(uri: string): SourceDocument | undefined {
        const location = new URL(uri);
        if (location.protocol !== 'file:') return undefined;
        try {
            return { uri, text: readFileSync(fileURLToPath(location), 'utf8') };
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'ENOENT' || code === 'ENOTDIR') return undefined;
            throw error;
        }
    }
}
