import { randomUUID } from 'node:crypto';
import { lstat, readFile, readdir, readlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeCleanupError, ownTemporaryDirectory, removeOwnedDirectory } from './native-process.js';
import { type NativeDefinitionObservation, VsCodeSession } from './vscode-session.js';

/** Mutable documents/files belong to one case; the installed host has suite ownership. */
export class NativeDefinitionCase {
  private readonly id = randomUUID();
  private directory: string | undefined;
  private session: VsCodeSession | undefined;
  private opening: Promise<void> | undefined;
  private disposal: Promise<void> | undefined;
  private opened = false;
  private initialTree: readonly TreeEntry[] = [];
  private actual: NativeDefinitionObservation | undefined;
  constructor(private readonly getSession: () => Promise<VsCodeSession>, private readonly extensionId: string,
    private readonly sources: Readonly<Record<string, string>>, private readonly workspace: string) {}

  open(): Promise<void> { return this.opening ??= this.openOwnedCase(); }
  private async openOwnedCase(): Promise<void> {
    if (typeof this.sources['entry.expec'] !== 'string') throw new Error('A definition case needs its owned entry.');
    this.directory = await ownTemporaryDirectory('expec-native-definition-', this.workspace);
    const files: Record<string, string> = {};
    for (const [name, text] of Object.entries(this.sources)) {
      if (basename(name) !== name || name === '.' || name === '..') throw new Error('A definition source must be one owned file name.');
      files[name] = join(this.directory, name);
      await writeFile(files[name], text, 'utf8');
    }
    this.initialTree = await tree(this.directory);
    this.session = await this.getSession();
    this.actual = await this.session.openNativeDefinition(this.id, this.extensionId, files);
    this.opened = true;
  }
  async editEntry(text: string): Promise<void> {
    await this.open();
    this.actual = await this.session!.editNativeDefinition(this.id, 'entry', text);
  }
  async editImport(text: string): Promise<void> {
    await this.open();
    this.actual = await this.session!.editNativeDefinition(this.id, 'import', text);
  }
  async goTo(line: number, column: number): Promise<void> {
    if (!Number.isInteger(line) || !Number.isInteger(column) || line < 1 || column < 1) throw new RangeError('Native editor coordinates are one-based integers.');
    await this.open();
    this.actual = await this.session!.goToNativeDefinition(this.id, line - 1, column - 1);
  }
  observation(): NativeDefinitionObservation {
    if (!this.actual) throw new Error('No real native definition observation was recorded.');
    return this.actual;
  }
  locationFileName(): string { const location = this.observation().locations[0]; return location ? basename(fileURLToPath(location.uri)) : ''; }
  activeFileName(): string { return basename(fileURLToPath(this.observation().active.uri)); }
  locationUsesOwnedFile(fileName: string): boolean { const uri = this.observation().locations[0]?.uri; return uri !== undefined && uri === this.observation().ownedUris[fileName]; }
  activeUsesOwnedFile(fileName: string): boolean { return this.observation().active.uri === this.observation().ownedUris[fileName]; }
  async filesUnchanged(): Promise<boolean> {
    await this.open();
    return JSON.stringify(await tree(this.directory!)) === JSON.stringify(this.initialTree);
  }
  dispose(): Promise<void> { return this.disposal ??= this.disposeOwnedCase(); }
  private async disposeOwnedCase(): Promise<void> {
    await this.opening?.catch(() => undefined);
    if (!this.directory) return;
    if (!this.opened) throw new NativeCleanupError('Native definition setup/cleanup is unconfirmed; retained ' + this.directory);
    try { await this.session!.disposeNativeDefinition(this.id); }
    catch (error) { throw new NativeCleanupError('Native definition cleanup is unconfirmed; retained ' + this.directory, { cause: error }); }
    await removeOwnedDirectory(this.directory);
  }
}
type TreeEntry = { path: string; kind: 'directory' | 'file' | 'symlink'; bytes?: string; target?: string };
async function tree(root: string): Promise<readonly TreeEntry[]> {
  const result: TreeEntry[] = [];
  const visit = async (directory: string, prefix: string): Promise<void> => {
    const names = await readdir(directory);
    for (const name of names.sort()) {
      const path = prefix ? prefix + '/' + name : name;
      const file = join(directory, name);
      const info = await lstat(file);
      if (info.isSymbolicLink()) result.push({ path, kind: 'symlink', target: await readlink(file) });
      else if (info.isDirectory()) { result.push({ path, kind: 'directory' }); await visit(file, path); }
      else if (info.isFile()) result.push({ path, kind: 'file', bytes: (await readFile(file)).toString('base64') });
      else throw new Error('The owned definition tree contains an unsupported entry.');
    }
  };
  await visit(root, '');
  return result;
}
