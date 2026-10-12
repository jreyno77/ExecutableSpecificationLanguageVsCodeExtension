import * as vscode from 'vscode';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { ConnectionController as Controller } from '../core/ConnectionController.js';
import type { ConnectionController } from "../core/ConnectionController.js";
import type { ExtensionContext } from "vscode";
import type { ConnectionState } from "../core/ConnectionState.js";
import type { ConnectionConfiguration } from "../core/ConnectionConfiguration.js";
import type { PreviewConfigurationFeedback } from "../core/PreviewConfigurationFeedback.js";
import type { ConnectionWorkFeedback } from "../core/ConnectionWorkFeedback.js";






/**
 * Unverified implementation obligation.
 * Requires package: vscode-types (build)
 * Requires package: node-types (build)
 * Requires package: expec (runtime)
 * Requires package: vscode-test-electron (test)
 * Depends on: ConnectionController
 */
export class ConnectionSidebar {
    private readonly changes = new vscode.EventEmitter<ConnectionState | undefined>();
    readonly onDidChangeTreeData = this.changes.event;
    private readonly resources: vscode.Disposable[] = [];
    private watches: vscode.Disposable[] = [];
    private controller?: ConnectionController;
    private state?: ConnectionState;
    private saved?: ConnectionConfiguration;
    private folder?: vscode.WorkspaceFolder;
    private filename?: string;
    private canonical?: string;
    private watchTarget?: string;
    private watchSignature = '';
    private lifetime = 0;
    private reading = 0;
    private watching = 0;
    private writing = 0;
    private disposed = false;
    private saving = 0;
    private choicePending = false;
    private hostFailure?: string;
    private loading: Promise<void> = Promise.resolve();
    private work?: ConnectionWorkFeedback;
    private workRevision = 0;
    private choices = 0;
    private commandOperation: Promise<void> = Promise.resolve();

    constructor(context: ExtensionContext, previews: PreviewConfigurationFeedback) {
        this.previews = previews;
        this.resources.push(
            vscode.window.registerTreeDataProvider('expec.connection', this),
            vscode.commands.registerCommand('expec.chooseProject', (directory?: vscode.Uri) => this.choose(directory)),
            vscode.commands.registerCommand('expec.editConnection', () => { this.editConnection(); return this.commandOperation; }),
            vscode.commands.registerCommand('expec.newConnection', () => { this.newConnection(); return this.commandOperation; }),
            vscode.commands.registerCommand('expec.disconnectConnection', () => this.disconnect()),
            vscode.commands.registerCommand('expec.reconnectConnection', () => this.reconnect()),
            vscode.commands.registerCommand('expec.deleteConnection', () => { this.deleteConnection(); return this.commandOperation; }),
            vscode.workspace.onDidSaveTextDocument(document => {
                if (!this.saving && this.isManifest(document.uri)) void this.readSaved();
            }),
            vscode.workspace.onDidChangeTextDocument(event => {
                if (!this.saving && this.isManifest(event.document.uri)) void this.readSaved();
            }),
            vscode.workspace.onDidCloseTextDocument(document => {
                if (!this.saving && this.isManifest(document.uri)) void this.readSaved();
            }),
            vscode.workspace.onDidChangeConfiguration(event => {
                if (event.affectsConfiguration('expec.configurationFile')) this.followFolder();
            }),
            vscode.workspace.onDidChangeWorkspaceFolders(() => this.followFolder()),
        );
        context.subscriptions.push(this);
    }
    /**
     * Unverified implementation obligation.
     * Register the native .expec Project Connection view and legacy Choose Project command once. Contribute a dedicated .expec Activity Bar container with a packaged recognizable monochrome icon and move the existing expec.connection view into it, retaining its public view ID and actual registered TreeDataProvider. Supply discoverable New Connection and Edit Connection title actions, and row context actions Edit Connection, New Connection, Disconnect or Reconnect according to the actual state, and Delete Connection when project metadata exists. Use native commands expec.newConnection, expec.editConnection, expec.disconnectConnection, expec.reconnectConnection and expec.deleteConnection, with their declared activation and contextual menus. Adapt this same instance to standard TreeDataProvider APIs; native activation exposes that actual registered provider as connectionTreeProvider alongside the same native LanguageClient. Existing client identity and methods remain intact; no test-only core query or reconstructed test rows. Start core ConnectionController for the supplied absolute local manifest filename, feeding actual saved text or absence and whether the document can be written. Display checking until core verifies the connection. Legacy picking a folder sends its absolute fsPath to core; cancel does nothing. Switching filename withdraws work, disposes the previous controller and watches before following the new configuration; obsolete callbacks cannot affect the view or save a file. Attach any current work observer to the new controller. Settings expec.configurationFile defaults to expec.json relative to the selected workspace folder; a single folder can be selected automatically, multiple folders require a workspace choice. Empty/remote workspaces show an explanation and do not claim a connection. Opening the view or invoking a command activates the extension; opening an expec document still activates existing language support. Forward the actual selected saved ConnectionConfiguration snapshot to the supplied preview feedback whenever it changes, independently of target verification or session-only disconnect. Withdraw the prior preview selection with absence before switching manifests. Do not parse it again or wait for connected status to permit authored previews.
     */
    start(configurationFile: string): void {
        if (this.disposed) return;
        if (!isAbsolute(configurationFile)) throw new TypeError('Provide an absolute local configuration filename.');
        const filename = resolve(configurationFile);
        if (this.filename === filename && this.controller) return;
        const lifetime = this.withdrawConfiguration();
        if (!this.live(lifetime)) return;
        this.filename = filename;
        this.folder ??= vscode.workspace.workspaceFolders?.find(folder => folder.uri.scheme === 'file'
            && !relative(folder.uri.fsPath, filename).startsWith('..'));
        this.controller = new Controller({
            present: state => { if (this.live(lifetime)) this.present(state); },
            saveConfiguration: (previous, text) => { if (this.live(lifetime)) this.saveConfiguration(previous, text); },
        });
        const controller = this.controller;
        this.attachWork(controller, lifetime);
        if (!this.live(lifetime) || controller !== this.controller) return;
        this.changes.fire(undefined);
        if (!this.live(lifetime) || controller !== this.controller) return;
        this.loading = this.updateWatches().then(() => this.live(lifetime) ? this.readSaved() : undefined).catch(error => this.hostProblem(error, lifetime));
    }
    /**
     * Unverified implementation obligation.
     * Translate the current core state into native TreeItem labels, description, tooltip and contextual command availability; do not validate configuration or decide connection policy. Use current core guidance.hasProject for Delete availability; a requested state.target alone does not prove saved project metadata exists. Show the actual target and explanation, including explicit session-only disconnected status. Make the actual selected manifest filename and full absolute path visible in the native view so the author can identify which metadata these commands affect; hidden provider fields alone do not satisfy this presentation. Connected means the configured directory has a verified filesystem identity, not that native build prerequisites or generation succeeded. Keep scoped native watches for the selected manifest and current logical/canonical target and their existing ancestors, including when a target is absent. Forward actual relevant configuration and target events to core, including creation, deletion and settings changes, without a manual Refresh action, polling, scanning or recursive project capture. Dispose old watches when the target/configuration changes; changes at an old target cannot restore an obsolete state. Register before reading and recheck once after registration; registration alone does not prove the operating-system watcher is ready. Surface watch failures rather than showing a stale healthy status.
     */
    present(state: ConnectionState): void {
        if (this.disposed || state.configurationFile !== this.filename) return;
        if (state.target !== this.watchTarget) this.canonical = undefined;
        this.watchTarget = state.target;
        if (state.verifiedDirectory) this.canonical = state.verifiedDirectory;
        this.state = state;
        this.projectContext();
        this.changes.fire(undefined);
        const lifetime = this.lifetime;
        void this.followWatches().catch(error => this.hostProblem(error, lifetime));
    }
    /**
     * Unverified implementation obligation.
     * Fulfill this exact current core save request using VS Code file/document APIs. Recheck the selected filename, current saved text and dirty-editor state immediately before applying; refuse stale requests or dirty documents without overwriting user edits. Save only the manifest selected by the author, preserve all other settings as supplied by core, and never write connected-project source. Confirm success to core with actual saved text, or report the failure using core.saveFailed with the exact previous snapshot. A requested write or picker result alone never proves success. Missing manifests can be created only by explicit Choose Project or New Connection actions. Do not create projects, install packages, compile or generate outputs. Forward successful actual saved confirmation to the same preview feedback; dirty edits continue using saved bytes, not unsaved configuration text. Actual apply/save effects are not atomic and failures do not establish rollback.
     */
    saveConfiguration(previous: ConnectionConfiguration, text: string): void {
        if (this.disposed || previous.file !== this.filename || !this.controller) return;
        void this.persist(previous, text);
    }
    /**
     * Unverified implementation obligation.
     * Stop core and dispose every owned view, command, event subscription and watcher. Repeated disposal is harmless; pending reads, guidance, confirmations and saves cannot publish or initiate writes after disposal. Cleanup must attempt all owned resources even when one throws and preserve actual causes. Withdraw and release the work observer and selected preview configuration before releasing this native lifetime; the existing awaited GenerationHost shutdown retains terminal worker results until owned work settles.
     */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.choices++;
        this.lifetime++;
        this.reading++;
        this.watching++;
        this.writing++;
        const resources = [...this.watches, ...this.resources, this.changes];
        if (this.controller) resources.push(this.controller);
        this.watches = [];
        this.resources.length = 0;
        this.controller = undefined;
        this.state = undefined;
        this.saved = undefined;
        const work = this.work;
        this.work = undefined;
        this.workRevision++;
        this.projectContext();
        this.release([{ dispose: () => work?.configurationChanged(undefined) },
            { dispose: () => this.previews.configurationChanged(undefined) }, ...resources]);
    }
    getChildren(element?: ConnectionState): ConnectionState[] {
        if (this.disposed || element) return [];
        return [this.state ?? { configurationFile: this.filename ?? '', status: 'unconfigured',
            message: 'Choose a local workspace folder and its project connection.' }];
    }

    getTreeItem(state: ConnectionState): vscode.TreeItem {
        const status = this.hostFailure ? 'Live connection status unavailable' : state.status;
        const item = new vscode.TreeItem(state.configurationFile ? basename(state.configurationFile) + ' — ' + status : status);
        item.contextValue = this.hostFailure ? 'unavailable' : state.status;
        item.description = state.target;
        item.tooltip = [state.configurationFile, this.hostFailure ?? state.message].filter(Boolean).join('\n');
        item.iconPath = new vscode.ThemeIcon(state.status === 'disconnected' ? 'debug-disconnect' : state.status === 'connected' ? 'plug' : 'info');
        if (state.target) item.resourceUri = vscode.Uri.file(state.target);
        return item;
    }

    private live(lifetime: number): boolean { return !this.disposed && this.lifetime === lifetime; }

    private isManifest(uri: vscode.Uri): boolean {
        return uri.scheme === 'file' && !!this.filename && this.samePath(uri.fsPath, this.filename);
    }

    private samePath(first: string, second: string): boolean {
        return process.platform === 'win32' ? resolve(first).toLowerCase() === resolve(second).toLowerCase()
            : resolve(first) === resolve(second);
    }

    private dirty(): boolean {
        return vscode.workspace.textDocuments.some(document => this.isManifest(document.uri) && document.isDirty);
    }

    private async readText(filename: string): Promise<string | undefined> {
        try { return new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.file(filename))); }
        catch (error) {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'FileNotFound') return undefined;
            throw error;
        }
    }

    private async readSaved(): Promise<void> {
        const filename = this.filename, controller = this.controller, lifetime = this.lifetime, reading = ++this.reading;
        if (!filename || !controller || this.disposed) return;
        try {
            const text = await this.readText(filename);
            if (!this.live(lifetime) || reading !== this.reading || controller !== this.controller) return;
            const writable = !this.dirty() && vscode.workspace.fs.isWritableFileSystem('file') !== false;
            const snapshot = Object.freeze({ file: filename, ...(text === undefined ? {} : { text }), writable });
            const previous = this.saved;
            this.saved = snapshot;
            this.choicePending = false;
            this.hostFailure = undefined;
            controller.configurationChanged(snapshot);
            if (this.live(lifetime) && reading === this.reading && controller === this.controller) this.projectContext();
            if (this.live(lifetime) && reading === this.reading && controller === this.controller
                && (!previous || previous.file !== snapshot.file || previous.text !== snapshot.text || previous.writable !== snapshot.writable)) {
                this.previews.configurationChanged(snapshot);
            }
        } catch (error) { if (reading === this.reading) this.hostProblem(error, lifetime); }
    }

    private async choose(directory?: vscode.Uri): Promise<void> {
        if (this.disposed) return;
        const intent = this.newIntent();
        if (!await this.prepareSelection(intent)) return;
        const controller = this.controller, previous = this.saved;
        if (!controller || !previous) return;
        const current = this.choiceCurrent(controller, previous, intent, false);
        if (!current()) return;
        const choice = directory ?? (await vscode.window.showOpenDialog({ canSelectFiles: false,
            canSelectFolders: true, canSelectMany: false, openLabel: 'Choose Project' }))?.[0];
        if (!current() || !choice) return;
        if (choice.scheme !== 'file') {
            await vscode.window.showInformationMessage('Project connections require a local directory.');
            return;
        }
        this.choicePending = true;
        controller.chooseProject(choice.fsPath);
        if (this.state?.status !== 'checking') this.choicePending = false;
    }

    private followFolder(): void {
        if (this.disposed) return;
        const folders = vscode.workspace.workspaceFolders ?? [];
        if (this.folder && !folders.some(folder => folder.uri.toString() === this.folder!.uri.toString())) {
            this.folder = undefined;
            const lifetime = this.withdrawConfiguration();
            if (!this.live(lifetime)) return;
            this.changes.fire(undefined);
            if (!this.live(lifetime)) return;
        }
        this.folder ??= folders.length === 1 && folders[0]?.uri.scheme === 'file' ? folders[0] : undefined;
        if (!this.folder) return;
        const setting = vscode.workspace.getConfiguration('expec', this.folder.uri).get<string>('configurationFile', 'expec.json');
        if (!setting.trim()) { this.hostProblem(new Error('Choose a nonblank configuration filename.'), this.lifetime); return; }
        this.start(resolve(this.folder.uri.fsPath, setting));
    }

    private async followWatches(force = false): Promise<void> {
        const lifetime = this.lifetime;
        const changed = await this.updateWatches(force);
        if (changed && this.live(lifetime) && !this.choicePending && this.state?.target) {
            this.controller?.targetChanged(this.state.target);
        }
    }
    private async updateWatches(force = false): Promise<boolean> {
        const filename = this.filename, lifetime = this.lifetime;
        if (!filename || this.disposed) return false;
        const routes = [...new Set([filename, this.state?.target, this.canonical].filter((path): path is string => !!path))];
        const signature = routes.join('\n');
        if (!force && signature === this.watchSignature) return false;
        this.watchSignature = signature;
        const watching = ++this.watching, paths = new Set<string>(), installed: vscode.Disposable[] = [];
        for (const route of routes) for (let path = route; dirname(path) !== path; path = dirname(path)) paths.add(path);
        try {
            for (const path of paths) {
                const parent = dirname(path);
                let info: vscode.FileStat;
                try { info = await vscode.workspace.fs.stat(vscode.Uri.file(parent)); }
                catch (error) {
                    if (error && typeof error === 'object' && 'code' in error && error.code === 'FileNotFound') continue;
                    throw error;
                }
                if (!this.live(lifetime) || watching !== this.watching) { this.release(installed); return false; }
                if (!(info.type & vscode.FileType.Directory)) continue;
                const pattern = basename(path).replace(/[?*[\]{}]/g, character => '[' + character + ']');
                const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(parent), pattern));
                installed.push(watcher);
                const changed = (uri: vscode.Uri) => {
                    if (!this.live(lifetime) || watching !== this.watching || uri.scheme !== 'file') return;
                    const eventPath = uri.fsPath;
                    if (this.isManifest(uri) || routes.some(route => this.samePath(route, filename)
                        && !relative(eventPath, route).startsWith('..'))) {
                        if (!this.saving) void this.readSaved();
                    } else {
                        this.choicePending = false;
                        this.controller?.targetChanged(eventPath);
                    }
                    if (routes.some(route => !this.samePath(eventPath, route) && !relative(eventPath, route).startsWith('..'))) {
                        void this.followWatches(true).catch(error => this.hostProblem(error, lifetime));
                    }
                };
                installed.push(watcher.onDidCreate(changed), watcher.onDidChange(changed), watcher.onDidDelete(changed));
            }
            if (!this.live(lifetime) || watching !== this.watching) { this.release(installed); return false; }
            const previous = this.watches;
            this.watches = installed;
            this.release(previous);
            return true;
        } catch (error) {
            this.release(installed);
            if (!this.live(lifetime) || watching !== this.watching) return false;
            this.watchSignature = '';
            throw error;
        }
    }

    private async persist(previous: ConnectionConfiguration, text: string): Promise<void> {
        const controller = this.controller, state = this.state, lifetime = this.lifetime, reading = this.reading, writing = ++this.writing;
        const uri = vscode.Uri.file(previous.file);
        const current = () => this.live(lifetime) && controller === this.controller && writing === this.writing
            && state === this.state && reading === this.reading && previous.file === this.filename && this.saved?.text === previous.text;
        if (!controller || !current()) return;
        try {
            const actual = await this.readText(previous.file);
            if (!current() || actual !== previous.text || !previous.writable || this.dirty()) {
                if (this.live(lifetime)) controller.saveFailed(previous, 'Save or revert changed configuration before choosing a project.');
                return;
            }
            if (actual === text) { await this.readSaved(); return; }
            let document: vscode.TextDocument | undefined;
            const edit = new vscode.WorkspaceEdit();
            if (actual === undefined) {
                edit.createFile(uri, { overwrite: false, ignoreIfExists: false });
                edit.insert(uri, new vscode.Position(0, 0), text);
            } else {
                document = await vscode.workspace.openTextDocument(uri);
                if (!current()) return;
                if (document.isDirty || document.getText() !== actual) throw new Error('The configuration document changed before its edit.');
                edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
            }
            if (!current()) return;
            const before = await this.readText(previous.file);
            if (!current()) return;
            if (this.dirty() || before !== previous.text) throw new Error('The configuration changed before its edit.');
            this.saving = writing;
            if (!await vscode.workspace.applyEdit(edit)) throw new Error('The configuration edit was refused.');
            document ??= await vscode.workspace.openTextDocument(uri);
            if (!current() || document.getText() !== text) throw new Error('The configuration changed during its edit.');
            if (!await document.save()) throw new Error('The configuration save was refused.');
            if (!current() || await this.readText(previous.file) !== text || !current()) throw new Error('The saved configuration could not be verified.');
            if (this.saving === writing) this.saving = 0;
            await this.readSaved();
        } catch (error) {
            if (this.live(lifetime) && current()) controller.saveFailed(previous, String(error));
        } finally { if (this.saving === writing) this.saving = 0; }
    }

    private hostProblem(error: unknown, lifetime: number): void {
        if (!this.live(lifetime)) return;
        this.hostFailure = String(error);
        this.changes.fire(undefined);
        void vscode.window.showErrorMessage('Cannot follow the project connection: ' + this.hostFailure);
    }

    private release(resources: readonly vscode.Disposable[]): void {
        const errors: unknown[] = [];
        for (const resource of resources) try { resource.dispose(); } catch (error) { errors.push(error); }
        if (errors.length) throw new AggregateError(errors, 'Could not release all connection sidebar resources.');
    }

    private readonly previews: PreviewConfigurationFeedback;

    private withdrawConfiguration(): number {
        const lifetime = ++this.lifetime;
        this.choices++;
        this.reading++;
        this.watching++;
        this.writing++;
        const controller = this.controller;
        const resources: vscode.Disposable[] = controller ? [controller, ...this.watches] : [...this.watches];
        this.controller = undefined;
        this.watches = [];
        this.filename = undefined;
        this.saved = undefined;
        this.choicePending = false;
        this.state = undefined;
        this.canonical = undefined;
        this.watchTarget = undefined;
        this.watchSignature = '';
        this.hostFailure = undefined;
        this.projectContext();
        if (controller) {
            const work = this.work, observing = this.workRevision;
            resources.unshift({ dispose: () => { if (work && work === this.work && observing === this.workRevision) work.configurationChanged(undefined); } },
                { dispose: () => this.previews.configurationChanged(undefined) });
        }
        this.release(resources);
        return lifetime;
    }

/**
     * Unverified implementation obligation.
     * Attach one replaceable connection-owned work observer, immediately forwarding to the current controller or delivering absence if no controller exists. Replacing or disposing the observer withdraws the prior one. Retain this one observer across controller replacement while guarding current selection, observer identity and native lifetime around reentrant callbacks. Existing constructor and metadata-only callers remain valid. Actual activation always attaches its existing single GenerationHost here once; the independent preview callback carries raw saved metadata to previews and live package analysis but never generation. Do not duplicate core connection or generation decisions.
     */
observeWork(feedback: ConnectionWorkFeedback): void {
        const observing = ++this.workRevision, previous = this.work;
        this.work = undefined;
        previous?.configurationChanged(undefined);
        if (observing !== this.workRevision) return;
        if (this.disposed) { feedback.configurationChanged(undefined); return; }
        this.work = feedback;
        if (this.controller) this.attachWork(this.controller, this.lifetime);
        else feedback.configurationChanged(undefined);
    }

/**
     * Unverified implementation obligation.
     * Open the actual selected local manifest in the ordinary VS Code text editor. Preserve dirty text and do not save, create a missing file or change metadata merely to edit it. If the selected file does not exist, explain that New Connection can create it. Editing is the supported path for advanced existing output options. Guard selected filename and native lifetime around awaits.
     */
editConnection(): void {
        this.beginAction(intent => this.editSelected(intent));
    }

/**
     * Unverified implementation obligation.
     * Guide an explicit author choice with standard VS Code folder dialog, output QuickPick and destination InputBox steps; no project-scaffolding wizard or custom webview. Obtain the current plain ConnectionController.guidance result once before choices; absence uses the existing invalid or unavailable explanation and cannot start a proposal. Consume its captured configuration, configured flags, eligible output IDs, suggested destinations and requiresEntries, rather than parsing saved JSON, registering output profiles or reconstructing setup policy in the native adapter. Select any usable empty or existing local target directory. Present already configured output IDs, preserving their exact options, and the core's eligible new choices. Explain that advanced profiles can be retained or edited in the manifest but are not initialized with guessed options. Preserve authored selection order. Prompt an actual relative destination only for a newly selected output, labelled relative to the connected target, with the core-supplied editable suggestion. Suggestions are extension setup policy, not SDK defaults. Explain TypeScript folder mirroring from the manifest's source folder; core supplies sourceRoot '.', and the target-root suggestion avoids src/src duplication. Request real source entries only when guidance.requiresEntries is true; existing metadata retains build.entries and needs no new source prompt. For a missing manifest use an actual saved ordinary .expec source within its folder, or ask the author to select real .expec source files within that folder, and pass their literal relative entries; absent/cancelled source selection requests no creation. Never assume src/main.expec exists or create an authored entry. Capture the exact selected controller and saved file/text/writable snapshot plus selection revision and native lifetime before guidance; recheck after every asynchronous choice and immediately before forwarding core.createConnection. Cancellation at any step, selection replacement, changed saved metadata, dirty configuration or disposal cannot initiate a late write or change the old selection. Core owns proposal validation, target verification and persistence requests. Surface real refusals and save failures; do not claim rollback, target initialization, dependency readiness or generation success. Only the selected manifest may be created by the explicit New Connection action.
     */
newConnection(): void {
        this.beginAction(intent => this.guideConnection(intent));
    }

/**
     * Unverified implementation obligation.
     * Forward the explicit session-only suspension to the current core controller. Present its actual disconnected state and explain that saved configuration and files are retained and reconnection is available. The work observer withdraws connection-owned generation; its prior per-manifest opt-in is neither erased nor granted. Keep raw saved preview/package configuration available. No metadata write or target deletion.
     */
disconnect(): void {
        if (this.disposed) return;
        this.choices++;
        this.choicePending = false;
        this.controller?.disconnect();
    }

/**
     * Unverified implementation obligation.
     * Forward the explicit resume to the current core controller and show its real fresh verification outcome. Preserve prior explicit per-manifest generation opt-in exactly; a previously disabled connection stays disabled. Never start generation, replay a previous save or save configuration from reconnection. A later genuine source save is required even if opt-in was previously true.
     */
reconnect(): void {
        if (this.disposed) return;
        this.choices++;
        this.choicePending = false;
        this.controller?.reconnect();
    }

/**
     * Unverified implementation obligation.
     * Ask for explicit native confirmation naming the selected manifest and explaining that only its project metadata will be removed, with target files, outputs and packages retained. Cancellation changes nothing. Capture selected controller and exact saved snapshot before prompting; recheck selection, saved text, write safety and lifetime before core.deleteConnection. Dirty configuration or changed selection cannot delete another connection. Core owns the conditional metadata proposal and actual confirmation. Do not delete a manifest, source, generated artifact or target directory.
     */
deleteConnection(): void {
        this.beginAction(intent => this.confirmDelete(intent));
    }
    private attachWork(controller: ConnectionController, lifetime: number): void {
        const feedback = this.work, observing = this.workRevision;
        if (!feedback || !this.live(lifetime) || controller !== this.controller) return;
        controller.observeWork({ configurationChanged: configuration => {
            if (this.live(lifetime) && controller === this.controller && feedback === this.work && observing === this.workRevision) {
                feedback.configurationChanged(configuration);
            }
        } });
    }
    private projectContext(): void {
        const lifetime = this.lifetime;
        const hasProject = !this.disposed && this.controller?.guidance()?.hasProject === true;
        void vscode.commands.executeCommand('setContext', 'expec.connection.hasProject', hasProject)
            .then(undefined, error => this.hostProblem(error, lifetime));
    }
    private newIntent(): { choices: number; lifetime: number } { return { choices: ++this.choices, lifetime: this.lifetime }; }
    private intentCurrent(intent: { choices: number; lifetime: number }): boolean {
        return this.live(intent.lifetime) && intent.choices === this.choices;
    }
    private beginAction(action: (intent: { choices: number; lifetime: number }) => Promise<void>): void {
        if (this.disposed) { this.commandOperation = Promise.resolve(); return; }
        const intent = this.newIntent();
        this.commandOperation = action(intent).catch(error => {
            if (this.intentCurrent(intent)) this.hostProblem(error, intent.lifetime);
        });
    }
    private async prepareSelection(intent: { choices: number; lifetime: number }): Promise<boolean> {
        if (!this.intentCurrent(intent)) return false;
        if (!this.controller) {
            const folders = vscode.workspace.workspaceFolders ?? [];
            const folder = folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick();
            if (!this.intentCurrent(intent)) return false;
            if (!folder || folder.uri.scheme !== 'file') {
                await vscode.window.showInformationMessage('Choose a local workspace folder before connecting a project.');
                return false;
            }
            const setting = vscode.workspace.getConfiguration('expec', folder.uri).get<string>('configurationFile', 'expec.json');
            const filename = setting.trim() ? resolve(folder.uri.fsPath, setting) : undefined;
            const lifetime = intent.lifetime + 1, choices = intent.choices + 1;
            this.folder = folder;
            this.followFolder();
            // Only this command's own first selection may carry its intent into the new lifetime.
            // Reentrant selection or another command advances either revision again and stays obsolete.
            if (this.disposed || !this.controller || this.filename !== filename || this.lifetime !== lifetime || this.choices !== choices) return false;
            intent.lifetime = lifetime;
            intent.choices = choices;
        }
        const controller = this.controller;
        await this.loading;
        return !!controller && this.intentCurrent(intent) && controller === this.controller;
    }
    private choiceCurrent(controller: ConnectionController, previous: ConnectionConfiguration,
        intent: { choices: number; lifetime: number }, requireWritable = true): () => boolean {
        const reading = this.reading;
        return () => {
            const writable = !this.dirty() && vscode.workspace.fs.isWritableFileSystem('file') !== false;
            return this.intentCurrent(intent) && reading === this.reading && controller === this.controller
                && previous.file === this.filename && this.saved?.file === previous.file && this.saved.text === previous.text
                && this.saved.writable === previous.writable && writable === previous.writable && (!requireWritable || writable);
        };
    }
    private explainSelection(): Thenable<unknown> {
        return vscode.window.showInformationMessage(this.hostFailure ?? this.state?.message ?? 'Choose a local workspace and its .expec manifest first.');
    }
    private async editSelected(intent: { choices: number; lifetime: number }): Promise<void> {
        if (!await this.prepareSelection(intent)) return;
        const filename = this.filename;
        const current = () => this.intentCurrent(intent) && filename === this.filename;
        if (!filename || !current()) { if (!this.disposed) await this.explainSelection(); return; }
        const uri = vscode.Uri.file(filename);
        try {
            const info = await vscode.workspace.fs.stat(uri);
            if (!current()) return;
            if (!(info.type & vscode.FileType.File)) { await vscode.window.showInformationMessage('Select a local manifest file to edit.'); return; }
            const document = await vscode.workspace.openTextDocument(uri);
            if (!current()) return;
            await vscode.window.showTextDocument(document, { preview: false });
        } catch (error) {
            if (!current()) return;
            if (error && typeof error === 'object' && 'code' in error && error.code === 'FileNotFound') {
                await vscode.window.showInformationMessage('This manifest does not exist. New Connection can create it from your actual sources.');
            } else throw error;
        }
    }
    private async guideConnection(intent: { choices: number; lifetime: number }): Promise<void> {
        if (!await this.prepareSelection(intent)) return;
        const controller = this.controller, guidance = controller?.guidance();
        if (!controller || !guidance) { if (!this.disposed) await this.explainSelection(); return; }
        const current = this.choiceCurrent(controller, guidance.configuration, intent);
        if (!current()) { await vscode.window.showInformationMessage('Save or revert changed configuration before creating a connection.'); return; }
        const directory = (await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true,
            canSelectMany: false, openLabel: 'New Connection', title: 'Choose an empty or existing local target' }))?.[0];
        if (!current() || !directory) return;
        if (directory.scheme !== 'file') { await vscode.window.showInformationMessage('Project connections require a local directory.'); return; }
        const items = guidance.outputs.map(output => ({ id: output.id, label: output.id,
            description: output.configured ? 'Keep existing options' : 'Configure a new output',
            detail: output.configured ? 'Advanced options stay in the manifest and can be changed with Edit Connection.' : undefined,
            picked: output.configured, output }));
        const selected = await vscode.window.showQuickPick(items, { canPickMany: true, title: 'Choose outputs for this connection',
            placeHolder: 'Retain configured profiles or add simple outputs; advanced profiles are edited in the manifest.' });
        if (!current() || !selected) return;
        const outputs: Array<{ id: string; directory?: string }> = [];
        for (const item of selected) {
            if (item.output.configured) outputs.push({ id: item.id });
            else {
                const destination = await vscode.window.showInputBox({ title: item.id + ' output destination',
                    prompt: 'Relative to ' + directory.fsPath + (item.id === 'typescript'
                        ? '. TypeScript mirrors folders from the manifest source folder; . uses the target root.' : '.'),
                    value: item.output.suggestedDirectory, ignoreFocusOut: true });
                if (!current() || destination === undefined) return;
                outputs.push({ id: item.id, directory: destination });
            }
        }
        const entries: string[] = [];
        if (guidance.requiresEntries) {
            const sourceFolder = dirname(guidance.configuration.file), editor = vscode.window.activeTextEditor?.document;
            const active = editor && !editor.isUntitled && !editor.isDirty && this.sourceEntry(editor.uri, sourceFolder) !== undefined ? editor.uri : undefined;
            const sources = active ? [active] : await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false,
                canSelectMany: true, defaultUri: vscode.Uri.file(sourceFolder), filters: { '.expec sources': ['expec'] },
                openLabel: 'Use Source Entries', title: 'Choose actual saved sources in the manifest folder' });
            if (!current() || !sources?.length) return;
            for (const source of sources) {
                const entry = this.sourceEntry(source, sourceFolder);
                if (entry === undefined || vscode.workspace.textDocuments.some(document => document.uri.toString() === source.toString() && document.isDirty)) {
                    await vscode.window.showInformationMessage('Select saved local .expec sources within the manifest folder.'); return;
                }
                const info = await vscode.workspace.fs.stat(source);
                if (!current()) return;
                if (!(info.type & vscode.FileType.File) || info.type & vscode.FileType.SymbolicLink) {
                    await vscode.window.showInformationMessage('Select ordinary saved .expec source files.'); return;
                }
                entries.push(entry);
            }
        }
        if (!current()) return;
        this.choicePending = true;
        controller.createConnection(directory.fsPath, outputs, entries);
        if (this.state?.status !== 'checking') this.choicePending = false;
    }
    private sourceEntry(uri: vscode.Uri, sourceFolder: string): string | undefined {
        if (uri.scheme !== 'file' || !uri.fsPath.toLowerCase().endsWith('.expec')) return undefined;
        const entry = relative(sourceFolder, uri.fsPath);
        if (!entry || isAbsolute(entry) || entry === '..' || entry.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'))) return undefined;
        return entry.replaceAll('\\', '/');
    }
    private async confirmDelete(intent: { choices: number; lifetime: number }): Promise<void> {
        if (!await this.prepareSelection(intent)) return;
        const controller = this.controller, guidance = controller?.guidance();
        if (!controller || !guidance) { if (!this.disposed) await this.explainSelection(); return; }
        if (!guidance.hasProject) { await vscode.window.showInformationMessage('This manifest has no project connection to delete.'); return; }
        const current = this.choiceCurrent(controller, guidance.configuration, intent);
        if (!current()) { await vscode.window.showInformationMessage('Save or revert changed configuration before deleting a connection.'); return; }
        const answer = await vscode.window.showWarningMessage('Delete the project connection from ' + guidance.configuration.file
            + '? Only project metadata will be removed. Target files, sources, output settings and packages will be retained.',
            { modal: true }, 'Delete Connection');
        if (!current() || answer !== 'Delete Connection') return;
        this.choicePending = false;
        controller.deleteConnection();
    }

}
