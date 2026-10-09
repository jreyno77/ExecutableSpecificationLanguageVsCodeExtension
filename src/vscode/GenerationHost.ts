import type { GenerationOnSave } from "../core/GenerationOnSave.js";
import type { ExtensionContext } from "vscode";
import type { GenerationWorker } from "../core/GenerationWorker.js";
import type { ConnectionConfiguration } from "../core/ConnectionConfiguration.js";
import type { GenerationBuffer } from "../core/GenerationBuffer.js";
import type { GenerationState } from "../core/GenerationState.js";
import type { GenerationResult } from "../core/GenerationResult.js";
import type { GenerationShutdownFeedback } from "../core/GenerationShutdownFeedback.js";








/**
 * Unverified implementation obligation.
 * Requires package: vscode-types (build)
 * Requires package: node-types (build)
 * Requires package: typescript (build)
 * Requires package: vite (build)
 * Requires package: vscode-test-electron (test)
 * Depends on: GenerationOnSave
 */
export class GenerationHost {
    constructor(context: ExtensionContext, worker: GenerationWorker) {
        throw new Error("Not implemented: GenerationHost.construction");
    }
    /**
     * Unverified implementation obligation.
     * Register once the real post-save and open/change/close events, Enable Generation on Save (expec.enableGenerationOnSave) and Disable Generation on Save (expec.disableGenerationOnSave). Capture URI/text/version directly from ordinary local .expec save events and forward sourceSaved without saving again. Other documents only update buffer facts. Commands adapt an explicit author choice for the selected manifest; retain its boolean in workspace state keyed by exact manifest URI, default false. Assemble one core coordinator with this native buffer/presentation adapter and supplied worker. No native parsing, generation policy or output planning. Package the owned generation-worker entry with the pinned SDK. Supply resource-scoped expec.nodeExecutable (default node; explicit path allowed) to the concrete NodeGenerationWorker with its packaged entry. Launch without a shell, never fork's default Electron executable. Show the actual child version or launch error; preview packaging alone does not prove full CLI resource closure.
     */
    start(): void {
        throw new Error("Not implemented: GenerationHost.start");
    }
    /**
     * Unverified implementation obligation.
     * Receive the same raw selected saved ConnectionConfiguration as previews, independently of directory status. Withdraw the old selection before switching; load only the new manifest's explicit opt-in and forward both facts to core. Dirty configuration events retain saved text and notify core of actual buffer changes. Restart may replay configuration and current buffer facts, never previous save intents. Do not edit the language manifest or infer enabled from writable/connected.
     */
    configurationChanged(configuration: ConnectionConfiguration | undefined): void {
        throw new Error("Not implemented: GenerationHost.configurationChanged");
    }
    /**
     * Unverified implementation obligation.
     * Snapshot every current workspace.textDocuments ordinary file buffer, including hidden target buffers of other languages, using its actual uri/version/getText/isDirty. Closed buffers are absent. Keep native document object/lifetime checks around delayed callbacks; never provide a cached empty or clean set. Core decides which roots/inputs these facts protect.
     */
    buffers(): Array<GenerationBuffer> {
        throw new Error("Not implemented: GenerationHost.buffers");
    }
    /**
     * Unverified implementation obligation.
     * Show core's current generation status and actual explanation in one owned native status-bar item and its .expec Generation output channel. Keep this distinct from the connection directory status. Do not reinterpret permission, hide a partial-write warning or show a superseded success as current.
     */
    present(state: GenerationState): void {
        throw new Error("Not implemented: GenerationHost.present");
    }
    /**
     * Unverified implementation obligation.
     * Append the actual observed child runtime version and unchanged CLI JSON or launch/transport/cleanup failure to the owned output channel with its selected manifest context, including superseded or cancelled runs and partial effects. An exit code or dispatched notification alone is not proof of saved output.
     */
    record(configurationFile: string, result: GenerationResult): void {
        throw new Error("Not implemented: GenerationHost.record");
    }
    /**
     * Unverified implementation obligation.
     * Invalidate save/configuration callbacks and remove owned events/commands, then dispose core and request worker shutdown. Keep terminal effect recording and its output channel alive until worker completion; then dispose remaining status/output resources, attempt all cleanup and notify this completion with any actual causes. Repeated callers join the same shutdown. The native entry wraps this callback in its one awaited Promise, preserving cleanup failures.
     */
    shutdown(completion: GenerationShutdownFeedback): void {
        throw new Error("Not implemented: GenerationHost.shutdown");
    }
    /**
     * Unverified implementation obligation.
     * Initiate this same shutdown once, retaining asynchronous failure evidence. The entry point explicitly awaits shutdown completion; this native Disposable method alone is not proof of process termination. Never roll back user edits.
     */
    dispose(): void {
        throw new Error("Not implemented: GenerationHost.dispose");
    }
}
