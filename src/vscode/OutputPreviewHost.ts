import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { State } from 'vscode-languageclient/node';
import { previewChannel } from './output-preview-channel.js';
import type { OutputTabs } from "../ui/OutputTabs.js";
import type { ExtensionContext } from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";
import type { ConnectionConfiguration } from "../core/ConnectionConfiguration.js";
import type { PreviewPublication } from "../core/PreviewPublication.js";





/**
 * Unverified implementation obligation.
 * Requires package: language-client (runtime)
 * Requires package: vscode-types (build)
 * Requires package: node-types (build)
 * Requires package: typescript (build)
 * Requires package: vite (build)
 * Requires package: vscode-test-electron (test)
 * Requires package: playwright (test)
 * Depends on: OutputTabs
 */
export class OutputPreviewHost {
    private readonly context: ExtensionContext;
    private readonly client: LanguageClient;
    private readonly resources: vscode.Disposable[] = [];
    private panel?: vscode.WebviewPanel;
    private panelResources: vscode.Disposable[] = [];
    private ready = false;
    private configuration?: ConnectionConfiguration;
    private selection?: string;
    private latest?: PreviewPublication;
    private started = false;
    private disposed = false;
    constructor(context: ExtensionContext, client: LanguageClient) {
        this.context = context;
        this.client = client;
    }
    /**
     * Unverified implementation obligation.
     * Register Show Output Previews (expec.showOutputPreviews), the client notification handler and native editor-selection events once. Starting or activating the adapter registers the command without opening a panel. Invoking Show Output Previews creates or reveals one ordinary VS Code webview panel containing the packaged React OutputTabs application. Its browser bootstrap mounts OutputTabs and uses the existing Vite/React build to bundle React and ReactDOM locally, not external runtime imports. Package the resulting script/style assets under dist/webview in the VSIX. Preserve the real shipped UML renderer SDK worker and WASM runtime, including its module-relative resources and paths, so packaged native server rendering works without a checkout or external runtime download. Browser asset build and native renderer resource packaging precede implementation testing. Follow the current expec editor URI, including untitled; focusing the panel retains the last authored selection. Forward selection to server core without reading or compiling documents. Subscribe before client startup and replay latest selected URI and saved configuration when the same client becomes running, including restart. The existing native client and diagnostic feature APIs remain intact. Register owned resources in the supplied context; host lifetime guards only prevent disposed callbacks, not another business revision engine.
     */
    start(): void {
        if (this.started || this.disposed) return;
        this.started = true;
        this.resources.push(
            vscode.commands.registerCommand('expec.showOutputPreviews', () => this.show()),
            this.client.onNotification(previewChannel.publication, (publication: PreviewPublication) => this.present(publication)),
            this.client.onDidChangeState(({ newState }) => { if (!this.disposed && newState === State.Running) this.synchronize(); }),
            vscode.window.onDidChangeActiveTextEditor(editor => {
                // No text editor is a webview focus transition, not another authored selection.
                if (this.disposed || !editor) return;
                this.selection = editor.document.languageId === 'expec' ? editor.document.uri.toString() : undefined;
                this.send(previewChannel.selection, { uri: this.selection });
            }),
            vscode.workspace.onDidCloseTextDocument(document => {
                if (this.disposed || document.uri.toString() !== this.selection) return;
                this.selection = undefined;
                this.send(previewChannel.selection, { uri: undefined });
            }),
        );
        this.context.subscriptions.push(this);
        const editor = vscode.window.activeTextEditor;
        this.selection = editor?.document.languageId === 'expec' ? editor.document.uri.toString() : undefined;
        this.synchronize();
    }
    /**
     * Unverified implementation obligation.
     * Forward this captured saved configuration snapshot, or selection absence, to server core through the native client. Buffer the latest snapshot until the client is running. Do not parse or validate it, infer target readiness, capture project code, install packages or generate. Dirty configuration behavior is supplied by ConnectionSidebar and remains saved-text behavior.
     */
    configurationChanged(configuration: ConnectionConfiguration | undefined): void {
        if (this.disposed) return;
        this.configuration = configuration;
        this.send(previewChannel.configuration, { configuration });
    }
    /**
     * Unverified implementation obligation.
     * Adapt one current plain core presentation to the webview message channel. Cache only the latest full presentation for ready replay, panel recreation and temporarily hidden panels; postMessage success is dispatch only, not proof of rendering. Never transport Specification, compiler models, functions or private ownership data. Set webview HTML once per lifetime, mount the bundled React application before ready, and replay to that exact live panel. Resolve only packaged local script/style assets with asWebviewUri and restrict localResourceRoots to their folder. Enable scripts only; disable forms and command URIs. Use a CSP beginning default-src none with only the bundled scripts/styles and required inert data images allowed. Literal text is never HTML and SVG is never injected inline or fetched from target paths. Present the core source context and whole-view explanation as well as its ordered tabs.
     */
    present(publication: PreviewPublication): void {
        if (this.disposed) return;
        this.latest = publication;
        this.post();
    }
    /**
     * Unverified implementation obligation.
     * Dispose every owned panel, command and event/message subscription, attempt all cleanup even if one resource fails, and prevent later dispatch or selection/configuration events. Panel closure releases its webview only and does not stop language analysis; reopening receives the latest current presentation. The native entry point owns the supplied client and its one awaited stop.
     */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        const panel = this.panel;
        this.panel = undefined;
        this.ready = false;
        this.latest = undefined;
        this.configuration = undefined;
        this.selection = undefined;
        this.release([...(panel ? [panel] : []), ...this.panelResources.splice(0), ...this.resources.splice(0)]);
    }

    private synchronize(): void {
        if (this.disposed || this.client.state !== State.Running) return;
        this.send(previewChannel.configuration, { configuration: this.configuration });
        this.send(previewChannel.selection, { uri: this.selection });
    }
    private send(method: string, value: unknown): void {
        if (this.disposed || this.client.state !== State.Running) return;
        void this.client.sendNotification(method, value).catch(error => this.client.error('Preview notification failed.', error, false));
    }
    private post(): void {
        const panel = this.panel;
        if (this.disposed || !panel || !this.ready || !this.latest) return;
        void panel.webview.postMessage({ type: 'expec-preview', publication: this.latest }).then(undefined,
            error => this.client.error('Preview dispatch failed.', error, false));
    }
    private show(): void {
        if (this.disposed) return;
        if (this.panel) { this.panel.reveal(vscode.ViewColumn.Beside); this.post(); return; }
        const root = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
        const panel = vscode.window.createWebviewPanel('expec.outputPreviews', '.expec Outputs', vscode.ViewColumn.Beside,
            { enableScripts: true, enableForms: false, enableCommandUris: false, localResourceRoots: [root], retainContextWhenHidden: true });
        this.panel = panel;
        this.ready = false;
        this.panelResources.push(
            panel.webview.onDidReceiveMessage(message => {
                if (this.disposed || this.panel !== panel || message?.type !== 'expec-preview-ready') return;
                this.ready = true;
                this.post();
            }),
            panel.onDidChangeViewState(() => { if (this.panel === panel && panel.visible) this.post(); }),
            panel.onDidDispose(() => {
                if (this.panel !== panel) return;
                this.panel = undefined;
                this.ready = false;
                this.release(this.panelResources.splice(0));
            }),
        );
        const script = panel.webview.asWebviewUri(vscode.Uri.joinPath(root, 'preview.js'));
        const style = panel.webview.asWebviewUri(vscode.Uri.joinPath(root, 'preview.css'));
        const nonce = randomBytes(18).toString('base64');
        const attribute = (value: string) => value.replace(/[&"<>]/g, character => {
            switch (character) {
                case '&': return '&amp;';
                case '"': return '&quot;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                default: return character;
            }
        });
        const csp = "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src " + panel.webview.cspSource + "; img-src data:; form-action 'none'; base-uri 'none'";
        panel.webview.html = '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            + '<meta http-equiv="Content-Security-Policy" content="' + attribute(csp) + '"><title>.expec Outputs</title>'
            + '<link rel="stylesheet" href="' + attribute(style.toString()) + '"></head><body data-expec-output-previews>'
            + '<p id="preview-context" data-preview-context></p><p id="preview-message" role="status"></p><main id="output-host"></main>'
            + '<script nonce="' + nonce + '" src="' + attribute(script.toString()) + '"></script></body></html>';
    }
    private release(resources: vscode.Disposable[]): void {
        const failures: unknown[] = [];
        for (const resource of resources) { try { resource.dispose(); } catch (error) { failures.push(error); } }
        for (const error of failures.slice(1)) this.client.error('Additional preview cleanup failure.', error, false);
        if (failures.length) throw failures[0];
    }
}
