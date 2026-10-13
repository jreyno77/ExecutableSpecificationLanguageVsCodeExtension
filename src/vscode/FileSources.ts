import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SourceDocument } from "../core/SourceDocument.js";


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

/**
     * Unverified implementation obligation.
     * Adapt the exact file URI and selected absolute manifest filename into a verified primary manifest-directory-relative path through native path/ancestry identity APIs. Use portable / separators, preserve literal case/name, and never derive ownership by textual URI-prefix subtraction or from a generated target. Verify existing root/ancestors and ordinary file routes; a named unsaved file may use a verified existing parent without reading, creating or requiring its contents. Reject symlink escapes and alias routes that cannot establish the same source identity; unavailable or outside-root routes and nonfile/untitled URIs have no local path. A nested build.sourceRoots does not replace the primary root; an additional outside root cannot gain a guessed folder scope. Other filesystem errors surface. Core caches/invalidate these supplied facts; this native adapter adds no scope policy, configuration parser, whole-project discovery, installation or writes.
     */
localPath(uri: string, manifestFile: string): string | undefined {
        throw new Error("Not implemented: FileSources.localPath");
    }
}
