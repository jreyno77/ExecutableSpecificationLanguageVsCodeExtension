import { lstatSync, realpathSync, statSync, type BigIntStats } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
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
        let file: string;
        try {
            const location = new URL(uri);
            if (location.protocol !== 'file:' || location.search || location.hash) return undefined;
            file = fileURLToPath(location);
        } catch (error) {
            if (error instanceof TypeError) return undefined;
            throw error;
        }
        if (!this.absolutePath(file) || !this.absolutePath(manifestFile)) return undefined;
        const selectedRoot = dirname(manifestFile);
        try {
            const root = realpathSync.native(selectedRoot);
            const selectedIdentity = statSync(selectedRoot, { bigint: true });
            const rootIdentity = lstatSync(root, { bigint: true });
            if (!selectedIdentity.isDirectory() || !rootIdentity.isDirectory() || rootIdentity.isSymbolicLink()
                || !this.sameIdentity(selectedIdentity, rootIdentity)) return undefined;
            const selectedRelative = this.childPath(selectedRoot, file);
            const path = selectedRelative ?? this.childPath(root, file);
            if (path === undefined) return undefined;
            let route = selectedRelative === undefined ? root : selectedRoot;
            let canonical = root;
            const captured: Array<{ path: string; stat: BigIntStats; directory: boolean }> = [
                { path: root, stat: rootIdentity, directory: true },
            ];
            const segments = path.split(sep);
            for (const segment of segments.slice(0, -1)) {
                route = join(route, segment);
                canonical = join(canonical, segment);
                const actual = lstatSync(route, { bigint: true });
                const mapped = lstatSync(canonical, { bigint: true });
                if (!actual.isDirectory() || actual.isSymbolicLink() || !mapped.isDirectory() || mapped.isSymbolicLink()
                    || !this.sameIdentity(actual, mapped) || !this.samePath(realpathSync.native(route), canonical)) return undefined;
                captured.push({ path: route, stat: actual, directory: true }, { path: canonical, stat: mapped, directory: true });
            }
            canonical = join(canonical, segments.at(-1)!);
            const existing = this.fileIdentity(file);
            if (existing !== undefined) {
                const mapped = lstatSync(canonical, { bigint: true });
                if (!existing.isFile() || existing.isSymbolicLink() || !mapped.isFile() || mapped.isSymbolicLink()
                    || !this.sameIdentity(existing, mapped) || !this.samePath(realpathSync.native(file), canonical)) return undefined;
                captured.push({ path: file, stat: existing, directory: false }, { path: canonical, stat: mapped, directory: false });
            } else if (this.fileIdentity(canonical) !== undefined) return undefined;
            for (const before of captured) {
                const after = lstatSync(before.path, { bigint: true });
                if (after.isSymbolicLink() || (before.directory ? !after.isDirectory() : !after.isFile())
                    || !this.sameIdentity(before.stat, after)) return undefined;
            }
            if (!this.samePath(realpathSync.native(selectedRoot), root)
                || !this.sameIdentity(selectedIdentity, statSync(selectedRoot, { bigint: true }))) return undefined;
            if (existing === undefined && (this.fileIdentity(file) !== undefined || this.fileIdentity(canonical) !== undefined)) return undefined;
            return path.split(sep).join('/');
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'ENOENT' || code === 'ENOTDIR') return undefined;
            throw error;
        }
    }

    private absolutePath(path: string): boolean {
        return isAbsolute(path) && !path.includes('\0')
            && (process.platform !== 'win32' || !/^(?:[a-z]:(?![/\\])|[/\\](?![/\\])|[/\\]{2}[^/\\]*[/\\]?$)/i.test(path));
    }
    private childPath(root: string, file: string): string | undefined {
        const path = relative(root, file);
        return path && !isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep) ? path : undefined;
    }
    private samePath(first: string, second: string): boolean { return relative(first, second) === ''; }
    private sameIdentity(first: BigIntStats, second: BigIntStats): boolean {
        return first.dev >= 0n && first.ino > 0n && first.dev === second.dev && first.ino === second.ino;
    }
    private fileIdentity(file: string): BigIntStats | undefined {
        try { return lstatSync(file, { bigint: true }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
    }
}
