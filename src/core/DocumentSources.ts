import type { SourceDocument } from "./SourceDocument.js";

export interface DocumentSources {
    /**
     * Unverified implementation obligation.
     * Return the current saved text with this exact URI, or absence when unavailable. Do not discover projects, install dependencies or substitute empty text. Unexpected acquisition errors surface. Core overrides this saved snapshot with an open document's unsaved text.
     */
    read(uri: string): SourceDocument | undefined;

/**
     * Unverified implementation obligation.
     * Return the verified portable source path relative to this selected manifest's directory, using the exact supplied source URI and native root/file ancestry facts. A named unsaved file under verified existing ancestors can have a path without reading or creating its contents. A foreign route, unsupported URI, unavailable root or route escaping the verified root has no local path; never strip a URI prefix or guess ownership from declarations, folders, generated destinations or build.sourceRoots. A nested source root cannot shorten the primary manifest-relative path. Core supplies its exact captured sourceId separately. Unexpected provider errors surface. This query does not scan, install, capture a connected project or write.
     */
localPath(uri: string, manifestFile: string): string | undefined;
}
