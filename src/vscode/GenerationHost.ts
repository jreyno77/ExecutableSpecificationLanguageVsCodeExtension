import * as vscode from 'vscode';
import { GenerationOnSave as Coordinator } from '../core/GenerationOnSave.js';
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
    private readonly context: ExtensionContext;
    private readonly worker: GenerationWorker;
    private readonly coordinator: GenerationOnSave;
    private readonly item: vscode.StatusBarItem;
    private readonly channel: vscode.OutputChannel;
    private readonly resources: vscode.Disposable[] = [];
    private readonly completions: GenerationShutdownFeedback[] = [];
    private configuration?: ConnectionConfiguration;
    private started = false;
    private closing = false;
    private closed = false;
    private shutdownError?: string;
    private selection = 0;
    private choice = 0;
    constructor(context: ExtensionContext, worker: GenerationWorker) {
        this.context = context;
        this.worker = worker;
        this.item = vscode.window.createStatusBarItem('expec.generation', vscode.StatusBarAlignment.Left, 10);
        this.item.name = '.expec Generation';
        this.item.command = 'expec.generation.showLog';
        this.channel = vscode.window.createOutputChannel('.expec Generation');
        this.coordinator = new Coordinator(worker, this, this);
    }
    /**
     * Unverified implementation obligation.
     * Register once the real post-save and open/change/close events, Enable Generation on Save (expec.enableGenerationOnSave) and Disable Generation on Save (expec.disableGenerationOnSave). Capture URI/text/version directly from ordinary local .expec save events and forward sourceSaved without saving again. Other documents only update buffer facts. Commands adapt an explicit author choice for the selected manifest; retain its boolean in workspace state keyed by exact manifest URI, default false. Assemble one core coordinator with this native buffer/presentation adapter and supplied worker. No native parsing, generation policy or output planning. Package the owned generation-worker entry with the pinned SDK. Supply resource-scoped expec.nodeExecutable (default node; explicit path allowed) to the concrete NodeGenerationWorker with its packaged entry. Launch without a shell, never fork's default Electron executable. Show the actual child version or launch error; preview packaging alone does not prove full CLI resource closure.
     */
    start(): void {
        if (this.started || this.closing) return;
        this.started = true;
        const changed = () => { if (!this.closing) this.coordinator.editorChanged(); };
        this.resources.push(
            vscode.commands.registerCommand('expec.generation.showLog', () => this.channel.show(true)),
            vscode.commands.registerCommand('expec.enableGenerationOnSave', () => this.setEnabled(true)),
            vscode.commands.registerCommand('expec.disableGenerationOnSave', () => this.setEnabled(false)),
            vscode.workspace.onDidOpenTextDocument(changed),
            vscode.workspace.onDidChangeTextDocument(changed),
            vscode.workspace.onDidCloseTextDocument(changed),
            vscode.workspace.onDidSaveTextDocument(document => {
                if (this.closing || document.uri.scheme !== 'file' || document.languageId !== 'expec'
                    || document.isClosed || !vscode.workspace.textDocuments.includes(document)) return;
                this.coordinator.sourceSaved({ uri: document.uri.toString(), text: document.getText() }, document.version);
            }),
        );
        this.context.subscriptions.push(this);
        this.configurationChanged(this.configuration);
    }
    /**
     * Unverified implementation obligation.
     * Receive the same raw selected saved ConnectionConfiguration as previews, independently of directory status. Withdraw the old selection before switching; load only the new manifest's explicit opt-in and forward both facts to core. Dirty configuration events retain saved text and notify core of actual buffer changes. Restart may replay configuration and current buffer facts, never previous save intents. Do not edit the language manifest or infer enabled from writable/connected.
     */
    configurationChanged(configuration: ConnectionConfiguration | undefined): void {
        if (this.closing) return;
        this.selection++;
        this.configuration = configuration ? Object.freeze({ ...configuration }) : undefined;
        const key = this.configuration ? this.preferenceKey(this.configuration) : undefined;
        this.coordinator.configurationChanged(this.configuration, !!key && this.context.workspaceState.get<boolean>(key, false) === true);
    }
    /**
     * Unverified implementation obligation.
     * Snapshot every current workspace.textDocuments ordinary file buffer, including hidden target buffers of other languages, using its actual uri/version/getText/isDirty. Closed buffers are absent. Keep native document object/lifetime checks around delayed callbacks; never provide a cached empty or clean set. Core decides which roots/inputs these facts protect.
     */
    buffers(): Array<GenerationBuffer> {
        return vscode.workspace.textDocuments.filter(document => document.uri.scheme === 'file' && !document.isClosed)
            .map(document => ({ uri: document.uri.toString(), version: document.version, text: document.getText(), dirty: document.isDirty }));
    }
    /**
     * Unverified implementation obligation.
     * Show core's current generation status and actual explanation in one owned native status-bar item and its .expec Generation output channel. Keep this distinct from the connection directory status. Do not reinterpret permission, hide a partial-write warning or show a superseded success as current.
     */
    present(state: GenerationState): void {
        if (this.closing) return;
        this.item.text = '.expec Generation: ' + state.status;
        this.item.tooltip = state.message;
        this.item.show();
        this.channel.appendLine('[' + state.status + '] ' + state.message);
    }
    /**
     * Unverified implementation obligation.
     * Append the actual observed child runtime version and unchanged CLI JSON or launch/transport/cleanup failure to the owned output channel with its selected manifest context, including superseded or cancelled runs and partial effects. An exit code or dispatched notification alone is not proof of saved output.
     */
    record(configurationFile: string, result: GenerationResult): void {
        if (this.closed) return;
        this.channel.appendLine('Manifest: ' + configurationFile);
        if (result.runtimeVersion !== undefined) this.channel.appendLine('Node ' + result.runtimeVersion);
        if (result.report) this.channel.append(result.report);
        if (result.error) this.channel.appendLine('Generation error: ' + result.error);
        if (result.exitCode !== undefined) this.channel.appendLine('Exit ' + result.exitCode);
    }
    /**
     * Unverified implementation obligation.
     * Invalidate save/configuration callbacks and remove owned events/commands, then dispose core and request worker shutdown. Keep terminal effect recording and its output channel alive until worker completion; then dispose remaining status/output resources, attempt all cleanup and notify this completion with any actual causes. Repeated callers join the same shutdown. The native entry wraps this callback in its one awaited Promise, preserving cleanup failures.
     */
    shutdown(completion: GenerationShutdownFeedback): void {
        if (this.closed) { completion.stopped(this.shutdownError); return; }
        this.completions.push(completion);
        if (this.closing) return;
        this.closing = true;
        this.selection++;
        const failures: string[] = [];
        for (const resource of this.resources.splice(0)) {
            try { resource.dispose(); } catch (error) { failures.push(String(error)); }
        }
        try { this.coordinator.dispose(); } catch (error) { failures.push(String(error)); }
        const finish = (error?: string) => {
            if (this.closed) return;
            if (error) failures.push(error);
            for (const resource of [this.item, this.channel]) {
                try { resource.dispose(); } catch (cause) { failures.push(String(cause)); }
            }
            this.shutdownError = failures.length ? failures.join('\n') : undefined;
            this.closed = true;
            for (const joined of this.completions.splice(0)) {
                try { joined.stopped(this.shutdownError); }
                catch (cause) {
                    failures.push('Generation shutdown callback failed: ' + nativeError(cause));
                    this.shutdownError = failures.join('\n');
                }
            }
        };
        try { this.worker.dispose({ stopped: finish }); }
        catch (error) { finish('Worker cleanup is unconfirmed: ' + String(error)); }
    }
    /**
     * Unverified implementation obligation.
     * Initiate this same shutdown once, retaining asynchronous failure evidence. The entry point explicitly awaits shutdown completion; this native Disposable method alone is not proof of process termination. Never roll back user edits.
     */
    dispose(): void {
        this.shutdown({ stopped: error => { if (error) console.error('.expec generation cleanup failed: ' + error); } });
    }
    private preferenceKey(configuration: ConnectionConfiguration): string {
        return 'expec.generation.enabled:' + vscode.Uri.file(configuration.file).toString();
    }

    private async setEnabled(enabled: boolean): Promise<void> {
        const configuration = this.configuration, selection = this.selection, choice = ++this.choice;
        if (this.closing || !configuration) return;
        try {
            await this.context.workspaceState.update(this.preferenceKey(configuration), enabled);
            if (!this.closing && selection === this.selection && choice === this.choice && this.configuration === configuration)
                this.coordinator.configurationChanged(configuration, enabled);
        } catch (error) {
            if (!this.closing) {
                this.channel.appendLine('Generation preference could not be saved: ' + String(error));
                if (selection === this.selection && choice === this.choice && this.configuration === configuration)
                    await vscode.window.showErrorMessage('.expec generation preference could not be saved: ' + nativeError(error));
            }
        }
    }
}

function nativeError(error: unknown): string {
    try { return error instanceof Error ? error.message : String(error); }
    catch { return 'Native shutdown observer failed without a readable cause.'; }
}
