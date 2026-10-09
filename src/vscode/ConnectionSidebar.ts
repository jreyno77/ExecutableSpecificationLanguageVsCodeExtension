import * as vscode from 'vscode';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { ConnectionController as Controller } from '../core/ConnectionController.js';
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

    constructor(context: ExtensionContext) {
        this.resources.push(
            vscode.window.registerTreeDataProvider('expec.connection', this),
            vscode.commands.registerCommand('expec.chooseProject', (directory?: vscode.Uri) => this.choose(directory)),
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
     * Register the native .expec Project Connection view and Choose Project command once. Adapt this same instance to the standard TreeDataProvider APIs; native activation exposes that actual registered provider as connectionTreeProvider alongside the same native LanguageClient, for standard provider consumers. Existing client identity and methods remain intact; no extra core business query or reconstructed test rows. Start core ConnectionController for the supplied absolute local manifest filename, feeding actual saved text or absence and whether the document can be written. Display checking until core verifies the connection. Picking a folder sends its absolute fsPath to core; cancel does nothing. Switching filename disposes the previous controller and watches before following the new configuration; obsolete callbacks cannot affect the view or save a file. Settings expec.configurationFile defaults to expec.json relative to the selected workspace folder; a single folder can be selected automatically, multiple folders require a workspace choice. Empty/remote workspaces show an explanation and do not claim a connection. Opening the view or invoking the command activates the extension; opening an expec document still activates existing language support.
     */
    start(configurationFile: string): void {
        if (this.disposed) return;
        if (!isAbsolute(configurationFile)) throw new TypeError('Provide an absolute local configuration filename.');
        const filename = resolve(configurationFile);
        if (this.filename === filename && this.controller) return;
        this.release(this.watches);
        this.watches = [];
        this.controller?.dispose();
        const lifetime = ++this.lifetime;
        this.reading++;
        this.watching++;
        this.writing++;
        this.filename = filename;
        this.folder ??= vscode.workspace.workspaceFolders?.find(folder => folder.uri.scheme === 'file'
            && !relative(folder.uri.fsPath, filename).startsWith('..'));
        this.saved = undefined;
        this.choicePending = false;
        this.state = undefined;
        this.canonical = undefined;
        this.watchTarget = undefined;
        this.watchSignature = '';
        this.hostFailure = undefined;
        this.controller = new Controller({
            present: state => { if (this.live(lifetime)) this.present(state); },
            saveConfiguration: (previous, text) => { if (this.live(lifetime)) this.saveConfiguration(previous, text); },
        });
        this.changes.fire(undefined);
        this.loading = this.updateWatches().then(() => this.live(lifetime) ? this.readSaved() : undefined).catch(error => this.hostProblem(error, lifetime));
    }
    /**
     * Unverified implementation obligation.
     * Translate the current core state into native TreeItem labels, description and tooltip; do not validate configuration or decide connection policy. Show the actual target and explanation. Connected means the configured directory has a verified filesystem identity, not that native build prerequisites or generation succeeded. Keep scoped native watches for the selected manifest and current logical/canonical target and their existing ancestors, including when a target is absent. Forward actual relevant configuration and target events to core, including creation, deletion and settings changes, without a manual Refresh action, polling, scanning or recursive project capture. Dispose old watches when the target/configuration changes; changes at an old target cannot restore an obsolete state. Register before reading and recheck once after registration; registration alone does not prove the operating-system watcher is ready. Surface watch failures rather than showing a stale healthy status.
     */
    present(state: ConnectionState): void {
        if (this.disposed || state.configurationFile !== this.filename) return;
        if (state.target !== this.watchTarget) this.canonical = undefined;
        this.watchTarget = state.target;
        if (state.verifiedDirectory) this.canonical = state.verifiedDirectory;
        this.state = state;
        this.changes.fire(undefined);
        const lifetime = this.lifetime;
        void this.followWatches().catch(error => this.hostProblem(error, lifetime));
    }
    /**
     * Unverified implementation obligation.
     * Fulfill this exact current core save request using VS Code file/document APIs. Recheck the selected filename, current saved text and dirty-editor state immediately before applying; refuse stale requests or dirty documents without overwriting user edits. Save only the manifest selected by the author, preserve all other settings as supplied by core, and never write connected-project source. Confirm success to core with actual saved text, or report the failure using core.saveFailed with the exact previous snapshot. A requested write or picker result alone never proves success. Missing manifests can be created only by this explicit Choose Project action. Do not create projects, install packages, compile or generate outputs.
     */
    saveConfiguration(previous: ConnectionConfiguration, text: string): void {
        if (this.disposed || previous.file !== this.filename || !this.controller) return;
        void this.persist(previous, text);
    }
    /**
     * Unverified implementation obligation.
     * Stop core and dispose every owned view, command, event subscription and watcher. Repeated disposal is harmless; pending reads, picks and saves cannot publish or initiate writes after disposal. Cleanup must attempt all owned resources even when one throws.
     */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
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
        this.release(resources);
    }
    getChildren(element?: ConnectionState): ConnectionState[] {
        if (this.disposed || element) return [];
        return [this.state ?? { configurationFile: this.filename ?? '', status: 'unconfigured',
            message: 'Choose a local workspace folder and its project connection.' }];
    }

    getTreeItem(state: ConnectionState): vscode.TreeItem {
        const item = new vscode.TreeItem(this.hostFailure ? 'Live connection status unavailable' : state.status);
        item.contextValue = this.hostFailure ? 'unavailable' : state.status;
        item.description = state.target;
        item.tooltip = this.hostFailure ?? state.message;
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
            this.saved = snapshot;
            this.choicePending = false;
            this.hostFailure = undefined;
            controller.configurationChanged(snapshot);
        } catch (error) { if (reading === this.reading) this.hostProblem(error, lifetime); }
    }

    private async choose(directory?: vscode.Uri): Promise<void> {
        const lifetime = this.lifetime;
        if (this.disposed) return;
        if (!this.controller) {
            const folders = vscode.workspace.workspaceFolders ?? [];
            const folder = folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick();
            if (this.disposed || lifetime !== this.lifetime) return;
            if (!folder || folder.uri.scheme !== 'file') {
                await vscode.window.showInformationMessage('Choose a local workspace folder before connecting a project.');
                return;
            }
            this.folder = folder;
            this.followFolder();
        }
        await this.loading;
        const controller = this.controller, selected = this.lifetime;
        if (!controller || this.disposed) return;
        const choice = directory ?? (await vscode.window.showOpenDialog({ canSelectFiles: false,
            canSelectFolders: true, canSelectMany: false, openLabel: 'Choose Project' }))?.[0];
        if (!this.live(selected) || controller !== this.controller || !choice) return;
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
            this.controller?.dispose();
            this.controller = undefined;
            this.filename = undefined;
            this.state = undefined;
            this.saved = undefined;
            this.choicePending = false;
            this.lifetime++;
            this.release(this.watches);
            this.watches = [];
            this.folder = undefined;
            this.changes.fire(undefined);
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
}
