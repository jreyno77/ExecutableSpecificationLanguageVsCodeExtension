import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ExtensionContext, TreeDataProvider, TreeItem as NativeTreeItem } from 'vscode';

// A native API recorder, backed by real owned files. It records host operations;
// the real sidebar and language components decide every connection state.
let active: RecordedSidebarHost | undefined;
const host = () => { if (!active) throw new Error('No recorded sidebar host.'); return active; };
export class Disposable { constructor(private readonly release: () => void) {} dispose() { this.release(); } }
export class EventEmitter<T> {
  private readonly listeners = new Set<(value: T) => void>();
  readonly event = (receive: (value: T) => void, thisArg?: unknown, disposables?: Disposable[]) => {
    const listener = thisArg === undefined ? receive : receive.bind(thisArg);
    this.listeners.add(listener);
    const subscription = new Disposable(() => this.listeners.delete(listener));
    disposables?.push(subscription); return subscription;
  };
  fire(value: T) {
    for (const receive of this.listeners) {
      const completion = receive(value) as unknown as Promise<unknown> | undefined;
      if (completion && typeof completion.then === 'function') active?.track(Promise.resolve(completion));
    }
  }
  dispose() { this.listeners.clear(); }
}
export class Uri {
  private constructor(private readonly value: URL) {}
  static file(path: string) { return new Uri(pathToFileURL(resolve(path))); }
  static parse(value: string) { return new Uri(new URL(value)); }
  static joinPath(base: Uri, ...parts: string[]) { return Uri.file(join(base.fsPath, ...parts)); }
  get scheme() { return this.value.protocol.slice(0, -1); }
  get fsPath() { return fileURLToPath(this.value); }
  get path() { return decodeURIComponent(this.value.pathname); }
  toString() { return this.value.href; }
}
export class RelativePattern {
  readonly baseUri: Uri;
  constructor(base: string | Uri | { uri: Uri }, readonly pattern: string) {
    this.baseUri = typeof base === 'string' ? Uri.file(base) : 'uri' in base ? base.uri : base;
  }
}
export const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 };
export class FileSystemError extends Error {
  code = 'Unknown';
  static FileNotFound(resource: Uri) { const error = new FileSystemError(resource.toString()); error.code = 'FileNotFound'; return error; }
}
export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
export class TreeItem {
  description?: string; tooltip?: string; contextValue?: string; iconPath?: unknown; resourceUri?: Uri;
  constructor(public label: string, public collapsibleState = TreeItemCollapsibleState.None) {}
}
export class ThemeIcon { constructor(readonly id: string) {} }
export class Position { constructor(readonly line: number, readonly character: number) {} }
export class Range { constructor(readonly start: Position, readonly end: Position) {} }
export class TextEdit { constructor(readonly range: Range, readonly newText: string) {} static replace(range: Range, text: string) { return new TextEdit(range, text); } }
export class WorkspaceEdit {
  readonly changes = new Map<Uri, TextEdit[]>();
  readonly created = new Map<Uri, { overwrite?: boolean; ignoreIfExists?: boolean }>();
  createFile(uri: Uri, options: { overwrite?: boolean; ignoreIfExists?: boolean } = {}) { this.created.set(uri, options); }
  insert(uri: Uri, position: Position, text: string) { this.replace(uri, new Range(position, position), text); }
  set(uri: Uri, edits: TextEdit[]) { this.changes.set(uri, edits); }
  replace(uri: Uri, range: Range, text: string) { const changes = this.changes.get(uri) ?? []; changes.push(TextEdit.replace(range, text)); this.changes.set(uri, changes); }
}
class RecordedDocument {
  isDirty = false; version = 1; readonly isUntitled = false;
  constructor(readonly uri: Uri, private text: string) {}
  get fileName() { return this.uri.fsPath; }
  getText() { return this.text; }
  positionAt(offset: number) { const lines = this.text.slice(0, offset).split('\n'); return new Position(lines.length - 1, lines.at(-1)!.length); }
  replace(text: string) { this.text = text; this.isDirty = true; this.version++; host().changedDocuments.fire({ document: this }); }
  async save() { await workspace.fs.writeFile(this.uri, Buffer.from(this.text)); this.isDirty = false; host().savedDocuments.fire(this); return true; }
}
class RecordedWatcher {
  readonly created = new EventEmitter<Uri>();
  readonly changed = new EventEmitter<Uri>();
  readonly deleted = new EventEmitter<Uri>();
  readonly onDidCreate = this.created.event; readonly onDidChange = this.changed.event; readonly onDidDelete = this.deleted.event;
  disposed = false;
  constructor(readonly pattern: RelativePattern | string) {}
  matches(uri: Uri) {
    const path = typeof this.pattern === 'string' ? uri.fsPath : relative(this.pattern.baseUri.fsPath, uri.fsPath).replaceAll('\\', '/');
    const pattern = typeof this.pattern === 'string' ? this.pattern : this.pattern.pattern;
    const expression = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp('^' + expression + '$').test(path);
  }
  dispose() { this.disposed = true; this.created.dispose(); this.changed.dispose(); this.deleted.dispose(); }
}
export interface RecordedFileHold {
  readonly started: Promise<void>;
  release(): void;
  operation?: Promise<unknown>;
}
export class RecordedSidebarHost {
  readonly file: string; readonly context = { subscriptions: [] } as unknown as ExtensionContext;
  readonly providers = new Map<string, TreeDataProvider<unknown>>();
  readonly registeredCommands = new Map<string, (...arguments_: unknown[]) => unknown>();
  readonly registrations: Array<{ name: string; disposed: boolean }> = [];
  readonly watchers: RecordedWatcher[] = [];
  readonly writes: Array<{ file: string; text: string; operation: string }> = [];
  readonly documents: RecordedDocument[] = [];
  readonly configurationEvents = new EventEmitter<{ affectsConfiguration(section: string): boolean }>();
  readonly changedDocuments = new EventEmitter<{ document: RecordedDocument }>();
  readonly savedDocuments = new EventEmitter<RecordedDocument>();
  readonly closedDocuments = new EventEmitter<RecordedDocument>();
  readonly foldersChanged = new EventEmitter<unknown>();
  readonly pending = new Set<Promise<unknown>>();
  private operationSerial = 0;
  readonly reads: string[] = [];
  private readonly holds: Array<{ kind: 'read' | 'stat'; file: string; hold: RecordedFileHold; ready: Promise<void>; entered(): void }> = [];
  picker: Uri[] | undefined;
  private constructor(readonly directory: string) { this.file = join(directory, 'expec.json'); }
  static async create(configuration: string) {
    if (active) throw new Error('A recorded sidebar host is already owned.');
    const owned = new RecordedSidebarHost(await mkdtemp(join(tmpdir(), 'expec-sidebar-unit-')));
    await Promise.all([mkdir(join(owned.directory, 'shop')), mkdir(join(owned.directory, 'library'))]);
    await writeFile(owned.file, configuration); active = owned; return owned;
  }
  track<T>(operation: Promise<T>): Promise<T> { this.operationSerial++; this.pending.add(operation); void operation.then(() => this.pending.delete(operation), () => this.pending.delete(operation)); return operation; }
  holdNextRead(file: string): RecordedFileHold { return this.holdNextOperation('read', file); }
  holdNextStat(file: string): RecordedFileHold { return this.holdNextOperation('stat', file); }
  private holdNextOperation(kind: 'read' | 'stat', file: string): RecordedFileHold {
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>(complete => { release = complete; });
    const started = new Promise<void>(complete => { entered = complete; });
    const hold: RecordedFileHold = { started, release };
    this.holds.push({ kind, file: resolve(file), hold, ready, entered });
    return hold;
  }
  fileOperation<T>(kind: 'read' | 'stat', file: string, perform: () => Promise<T>): Promise<T> {
    if (kind === 'read') this.reads.push(resolve(file));
    const index = this.holds.findIndex(held => held.kind === kind && held.file === resolve(file));
    if (index < 0) return this.track(perform());
    const held = this.holds.splice(index, 1)[0]!;
    const operation = (async () => { held.entered(); await held.ready; return perform(); })();
    held.hold.operation = operation;
    return this.track(operation);
  }
  async addConfiguration(name: string, text: string): Promise<string> {
    if (basename(name) !== name) throw new Error('Use an owned configuration filename.');
    const file = join(this.directory, name);
    await writeFile(file, text);
    return file;
  }
  register(name: string, cleanup: () => void = () => {}) {
    const registration = { name, disposed: false }; this.registrations.push(registration);
    return new Disposable(() => { if (registration.disposed) return; registration.disposed = true; cleanup(); });
  }
  async restoreDirectory(name: string): Promise<string> {
    const path = resolve(this.directory, name), owned = relative(this.directory, path);
    if (!owned || owned.startsWith('..') || resolve(this.directory, owned) !== path) throw new Error('Restore only an owned directory.');
    await mkdir(path, { recursive: true });
    const uri = Uri.file(path);
    for (const watcher of this.watchers) if (!watcher.disposed && watcher.matches(uri)) watcher.created.fire(uri);
    return path;
  }
  async captureSavedConfiguration() { return Object.freeze({ file: this.file, text: await readFile(this.file, 'utf8'), writable: true }); }
  async replaceSavedConfiguration(text: string) {
    await writeFile(this.file, text);
    for (const watcher of this.watchers) if (!watcher.disposed && watcher.matches(Uri.file(this.file))) watcher.changed.fire(Uri.file(this.file));
  }
  async editWithoutSaving(text: string) { (await workspace.openTextDocument(Uri.file(this.file))).replace(text); }
  async rows(): Promise<NativeTreeItem[]> {
    const provider = this.providers.get('expec.connection');
    if (!provider) throw new Error('The actual native connection provider was not registered.');
    const children = await provider.getChildren();
    return Promise.all((children ?? []).map(child => provider.getTreeItem(child)));
  }
  async settleRequestedSave(excluded: readonly RecordedFileHold[] = []) {
    const remaining = () => [...this.pending].filter(operation => !excluded.some(hold => hold.operation === operation));
    let observedSerial = -1;
    while (remaining().length || observedSerial !== this.operationSerial) {
      observedSerial = this.operationSerial;
      await Promise.allSettled(remaining());
      await new Promise<void>(complete => setImmediate(complete));
    }
  }
  async savedConfiguration() { return readFile(this.file, 'utf8'); }
  async dispose() {
    await this.settleRequestedSave();
    if (active !== this || !basename(this.directory).startsWith('expec-sidebar-unit-') || dirname(this.directory) !== resolve(tmpdir())) throw new Error('The recorded host does not own this directory.');
    active = undefined; await rm(this.directory, { recursive: true, force: true });
  }
}
export const window = {
  registerTreeDataProvider(id: string, provider: TreeDataProvider<unknown>) {
    host().providers.set(id, provider); return host().register('view:' + id);
  },
  createTreeView(id: string, options: { treeDataProvider: TreeDataProvider<unknown> }) {
    host().providers.set(id, options.treeDataProvider); return host().register('view:' + id);
  },
  showOpenDialog: async () => host().picker,
  showWorkspaceFolderPick: async () => workspace.workspaceFolders[0],
  showInformationMessage: async (_message: string) => undefined,
  showWarningMessage: async (_message: string) => undefined,
  showErrorMessage: async (_message: string) => undefined,
};
export const commands = {
  registerCommand(name: string, callback: (...arguments_: unknown[]) => unknown) {
    host().registeredCommands.set(name, callback); return host().register('command:' + name);
  },
  executeCommand: async (name: string, ...arguments_: unknown[]) => host().registeredCommands.get(name)?.(...arguments_),
};
export const workspace = {
  get textDocuments() { return host().documents; },
  get workspaceFolders() { return [{ uri: Uri.file(host().directory), name: basename(host().directory), index: 0 }]; },
  getConfiguration: (_section?: string) => ({ get: (_key: string, fallback?: unknown) => fallback }),
  onDidChangeConfiguration: (receive: (event: { affectsConfiguration(section: string): boolean }) => void) => host().configurationEvents.event(receive),
  onDidChangeTextDocument: (receive: (event: { document: RecordedDocument }) => void) => host().changedDocuments.event(receive),
  onDidSaveTextDocument: (receive: (document: RecordedDocument) => void) => host().savedDocuments.event(receive),
  onDidCloseTextDocument: (receive: (document: RecordedDocument) => void) => host().closedDocuments.event(receive),
  onDidChangeWorkspaceFolders: (receive: (event: unknown) => void) => host().foldersChanged.event(receive),
  createFileSystemWatcher(pattern: RelativePattern | string) { const watcher = new RecordedWatcher(pattern); host().watchers.push(watcher); return watcher; },
  fs: {
    isWritableFileSystem: (scheme: string) => scheme === 'file',
    readFile(uri: Uri) { return host().fileOperation('read', uri.fsPath, () => readFile(uri.fsPath).catch(error => { if (error.code === 'ENOENT') throw FileSystemError.FileNotFound(uri); throw error; })); },
    stat(uri: Uri) { return host().fileOperation('stat', uri.fsPath, () => stat(uri.fsPath).then(value => ({ type: value.isDirectory() ? FileType.Directory : FileType.File, ctime: value.ctimeMs, mtime: value.mtimeMs, size: value.size })).catch(error => { if (error.code === 'ENOENT') throw FileSystemError.FileNotFound(uri); throw error; })); },
    writeFile(uri: Uri, content: Uint8Array) { host().writes.push({ file: uri.fsPath, text: Buffer.from(content).toString('utf8'), operation: 'writeFile' }); return host().track(writeFile(uri.fsPath, content)); },
    createDirectory(uri: Uri) { return host().track(mkdir(uri.fsPath, { recursive: true })); },
  },
  openTextDocument(uri: Uri | string): Promise<RecordedDocument> {
    return host().track((async () => {
      const resource = typeof uri === 'string' ? Uri.file(uri) : uri;
      let document = host().documents.find(candidate => candidate.uri.toString() === resource.toString());
      if (!document) { document = new RecordedDocument(resource, await workspace.fs.readFile(resource).then(bytes => Buffer.from(bytes).toString('utf8'))); host().documents.push(document); }
      return document;
    })());
  },
  applyEdit(edit: WorkspaceEdit): Promise<boolean> {
    return host().track((async () => {
      for (const [uri, options] of edit.created) {
        host().writes.push({ file: uri.fsPath, text: '', operation: 'createFile' });
        try { await writeFile(uri.fsPath, '', { flag: options.overwrite ? 'w' : 'wx' }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') { if (!options.ignoreIfExists) return false; } else throw error; }
      }
      for (const [uri, edits] of edit.changes) {
        const document = await workspace.openTextDocument(uri);
        const offsetAt = (position: Position) => document.getText().split('\n').slice(0, position.line).reduce((length, line) => length + line.length + 1, 0) + position.character;
        let text = document.getText();
        for (const edit of [...edits].sort((left, right) => offsetAt(right.range.start) - offsetAt(left.range.start))) {
          text = text.slice(0, offsetAt(edit.range.start)) + edit.newText + text.slice(offsetAt(edit.range.end));
        }
        host().writes.push({ file: uri.fsPath, text, operation: 'applyEdit' }); document.replace(text);
      }
      return true;
    })());
  },
};