import type { LanguageServerAdapter } from "./LanguageServerAdapter.js";
import type { ExtensionContext } from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";



/**
 * Unverified implementation obligation.
 * Requires package: language-client (runtime)
 * Requires package: vscode-types (build)
 * Requires package: typescript (build)
 * Requires package: vite (build)
 * Requires package: vitest (test)
 * Requires package: vscode-test-electron (test)
 * Depends on: LanguageServerAdapter
 */
export class EditorLanguageSupport {
    constructor(context: ExtensionContext, client: LanguageClient) {
        throw new Error("Not implemented: EditorLanguageSupport.construction");
    }
    /**
     * Unverified implementation obligation.
     * Request startup of the supplied native LanguageClient once. The native entry point owns its construction, packaged TypeScript server, expec selector (file and untitled), and single awaited stop on deactivation. Return that native client through the standard VS Code activation export for callers of its native feature APIs. Register owned resources with this extension context. Use native document diagnostic pull on edits. In the public provideDiagnostics middleware capture native document identity/version before awaiting next, then cancel an obsolete/closed result instead of returning empty success. The SDK owns scheduling, cancellation and diagnostic collections. Never replace newer feedback or reopen diagnostics for a closed document; do not rely on push version fields. Keep startup failures observable and keep core policy out of this host adapter.
     */
    start(): void {
        throw new Error("Not implemented: EditorLanguageSupport.start");
    }
    /**
     * Unverified implementation obligation.
     * Invalidate adapter-owned callbacks and remove owned registrations once. The native entry point owns the injected client and awaits its one stop promise on deactivation; this operation neither stops that client twice nor promises synchronous process termination.
     */
    dispose(): void {
        throw new Error("Not implemented: EditorLanguageSupport.dispose");
    }
}
