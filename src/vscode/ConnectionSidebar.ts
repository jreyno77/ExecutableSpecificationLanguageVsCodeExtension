import type { ConnectionController } from "../core/ConnectionController.js";
import type { ExtensionContext } from "vscode";
import type { ConnectionState } from "../core/ConnectionState.js";
import type { ConnectionConfiguration } from "../core/ConnectionConfiguration.js";




/**
 * Unverified implementation obligation.
 * Requires package: vscode-types (build)
 * Requires package: node-types (build)
 * Requires package: expec (runtime)
 * Requires package: vscode-test-electron (test)
 * Depends on: ConnectionController
 */
export class ConnectionSidebar {
    constructor(context: ExtensionContext) {
        throw new Error("Not implemented: ConnectionSidebar.construction");
    }
    /**
     * Unverified implementation obligation.
     * Register the native .expec Project Connection view and Choose Project command once. Start core ConnectionController for the supplied absolute local manifest filename, feeding actual saved text or absence and whether the document can be written. Display checking until core verifies the connection. Picking a folder sends its absolute fsPath to core; cancel does nothing. Switching filename disposes the previous controller and watches before following the new configuration; obsolete callbacks cannot affect the view or save a file. Settings expec.configurationFile defaults to expec.json relative to the selected workspace folder; a single folder can be selected automatically, multiple folders require a workspace choice. Empty/remote workspaces show an explanation and do not claim a connection. Opening the view or invoking the command activates the extension; opening an expec document still activates existing language support.
     */
    start(configurationFile: string): void {
        throw new Error("Not implemented: ConnectionSidebar.start");
    }
    /**
     * Unverified implementation obligation.
     * Translate the current core state into native TreeItem labels, description and tooltip; do not validate configuration or decide connection policy. Show the actual target and explanation. Connected means the configured directory has a verified filesystem identity, not that native build prerequisites or generation succeeded. Keep scoped native watches for the selected manifest and current logical/canonical target and their existing ancestors, including when a target is absent. Forward actual relevant configuration and target events to core, including creation, deletion and settings changes, without a manual Refresh action, polling, scanning or recursive project capture. Dispose old watches when the target/configuration changes; changes at an old target cannot restore an obsolete state. Register before reading and recheck once after registration; registration alone does not prove the operating-system watcher is ready. Surface watch failures rather than showing a stale healthy status.
     */
    present(state: ConnectionState): void {
        throw new Error("Not implemented: ConnectionSidebar.present");
    }
    /**
     * Unverified implementation obligation.
     * Fulfill this exact current core save request using VS Code file/document APIs. Recheck the selected filename, current saved text and dirty-editor state immediately before applying; refuse stale requests or dirty documents without overwriting user edits. Save only the manifest selected by the author, preserve all other settings as supplied by core, and never write connected-project source. Confirm success to core with actual saved text, or report the failure using core.saveFailed with the exact previous snapshot. A requested write or picker result alone never proves success. Missing manifests can be created only by this explicit Choose Project action. Do not create projects, install packages, compile or generate outputs.
     */
    saveConfiguration(previous: ConnectionConfiguration, text: string): void {
        throw new Error("Not implemented: ConnectionSidebar.saveConfiguration");
    }
    /**
     * Unverified implementation obligation.
     * Stop core and dispose every owned view, command, event subscription and watcher. Repeated disposal is harmless; pending reads, picks and saves cannot publish or initiate writes after disposal. Cleanup must attempt all owned resources even when one throws.
     */
    dispose(): void {
        throw new Error("Not implemented: ConnectionSidebar.dispose");
    }
}
