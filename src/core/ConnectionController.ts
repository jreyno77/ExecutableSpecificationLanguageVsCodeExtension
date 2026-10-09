import type { ConnectionFeedback } from "./ConnectionFeedback.js";
import type { ConnectionConfiguration } from "./ConnectionConfiguration.js";


/**
 * Unverified implementation obligation.
 * Requires package: expec (runtime)
 * Requires package: typescript (build)
 * Requires package: node-types (build)
 * Requires package: vitest (test)
 */
export class ConnectionController {
    constructor(feedback: ConnectionFeedback) {
        throw new Error("Not implemented: ConnectionController.construction");
    }
    /**
     * Unverified implementation obligation.
     * Capture this exact saved text and write safety for one selected local manifest. Advance currentness before any asynchronous work and withdraw the old connected state while checking. Missing text is unconfigured. Validate existing text with the real ConfigurationReader and registered built-in output profiles; invalid configuration stays invalid with its real diagnostic message and is never rewritten. Use ProjectConnector.connect with this absolute manifest filename. A valid configuration without a project is unconfigured; an unavailable root is unavailable; only an actual connected result establishes connected and verifiedDirectory. Preserve logical target and canonical verified directory separately. Do not scan or capture a project, install packages, generate outputs or parse native project code. Only the latest configuration/target revision may publish.
     */
    configurationChanged(snapshot: ConnectionConfiguration): void {
        throw new Error("Not implemented: ConnectionController.configurationChanged");
    }
    /**
     * Unverified implementation obligation.
     * Choose an absolute native directory for the current selected configuration. Reject invalid existing configuration without rewriting it. If writable is false, preserve the current target, request no save and present the message Save or revert unsaved configuration edits before choosing a project. Verify the proposed directory through the real connector before requesting persistence. A missing or unusable directory remains unavailable and requests no save. Preserve every other existing JSON field; change only project.root. For a missing manifest, propose formatVersion 1, version 0.1.0, build.entries [src/main.expec] and outputs []. This is this extension's explicit initial metadata setting, not a language default; connection does not check whether that source file exists, and authors must configure their actual build entry before compilation, with the selected root. Never write the file itself or report the new project connected before actual saved confirmation. Pass an immutable captured previous snapshot to feedback. New configuration or target revisions invalidate older verification and any unsent write request.
     */
    chooseProject(directory: string): void {
        throw new Error("Not implemented: ConnectionController.chooseProject");
    }
    /**
     * Unverified implementation obligation.
     * Recheck the current configured target automatically after relevant logical or canonical root or ancestor events, including deletion and restoration. Ignore unrelated paths and events for a superseded target. Reuse validated current configuration; perform only connector identity/availability checking, not tree capture. Withdraw connected while rechecking and suppress stale completion.
     */
    targetChanged(path: string): void {
        throw new Error("Not implemented: ConnectionController.targetChanged");
    }
    /**
     * Unverified implementation obligation.
     * For the exact previous object of the current pending save request, report unavailable with this host failure message; never pretend the requested configuration was saved or connected. Ignore failures from superseded requests.
     */
    saveFailed(previous: ConnectionConfiguration, message: string): void {
        throw new Error("Not implemented: ConnectionController.saveFailed");
    }
    /**
     * Unverified implementation obligation.
     * End this controller lifetime, invalidate pending asynchronous work and prevent later publication or save requests. Repeated disposal is harmless; the native caller owns watchers and view registrations.
     */
    dispose(): void {
        throw new Error("Not implemented: ConnectionController.dispose");
    }
}
