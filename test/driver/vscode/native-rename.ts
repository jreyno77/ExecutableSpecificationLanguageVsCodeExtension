import { randomUUID } from 'node:crypto';
import { lstat, readFile, readdir, readlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NativeCleanupError, ownTemporaryDirectory, removeOwnedDirectory } from './native-process.js';
import { VsCodeSession, type NativeRenameObservation } from './vscode-session.js';

/** One fresh saved project and two real buffers; the installed editor owns the host. */
export class NativeRenameCase {
  private readonly id = randomUUID();
  private directory?: string;
  private session?: VsCodeSession;
  private opening?: Promise<void>;
  private disposal?: Promise<void>;
  private opened = false;
  private initialTree = '';
  constructor(private readonly getSession: () => Promise<VsCodeSession>, private readonly extensionId: string,
    private readonly book: string, private readonly basket: string, private readonly workspace: string) {}

  open(): Promise<void> { return this.opening ??= this.openOwnedCase(); }
  private async openOwnedCase(): Promise<void> {
    this.directory = await ownTemporaryDirectory('expec-native-rename-', this.workspace);
    await writeFile(join(this.directory, 'book.expec'), this.book);
    await writeFile(join(this.directory, 'basket.expec'), this.basket);
    await writeFile(join(this.directory, 'expec.json'), JSON.stringify({ formatVersion: 1, version: '0.1.0',
      project: { root: '.' }, build: { entries: ['book.expec', 'basket.expec'] }, outputs: [] }));
    this.initialTree = await savedTree(this.directory);
    this.session = await this.getSession();
    await this.session.openNativeRename(this.id, this.extensionId, { book: join(this.directory, 'book.expec'),
      basket: join(this.directory, 'basket.expec'), configurationFile: join(this.directory, 'expec.json'),
      resetFile: join(this.workspace, 'expec.json') });
    this.opened = true;
  }
  async prepare(line: number, column: number): Promise<void> {
    coordinates(line, column); await this.open();
    await this.session!.prepareNativeRename(this.id, line - 1, column - 1);
  }
  async rename(line: number, column: number, newName: string): Promise<void> {
    coordinates(line, column); await this.open();
    await this.session!.applyNativeRename(this.id, line - 1, column - 1, newName);
  }
  private async observation(): Promise<NativeRenameObservation> {
    await this.open(); return this.session!.observeNativeRename(this.id);
  }
  async placeholder(): Promise<string> { return (await this.observation()).placeholder; }
  async bookText(): Promise<string> { return (await this.observation()).book.text; }
  async basketText(): Promise<string> { return (await this.observation()).basket.text; }
  async buffersDirty(): Promise<boolean> {
    const actual = await this.observation(); return actual.book.dirty && actual.basket.dirty;
  }
  async filesUnchanged(): Promise<boolean> { await this.open(); return await savedTree(this.directory!) === this.initialTree; }
  async wasRefused(): Promise<boolean> { return (await this.observation()).refused; }
  async explanationIncludes(text: string): Promise<boolean> { return (await this.observation()).explanation.includes(text); }
  dispose(): Promise<void> { return this.disposal ??= this.disposeOwnedCase(); }
  private async disposeOwnedCase(): Promise<void> {
    await this.opening?.catch(() => undefined);
    if (!this.directory) return;
    if (this.session) {
      if (!this.opened) throw new NativeCleanupError('Native rename setup/cleanup is unconfirmed; retained ' + this.directory);
      try { await this.session.disposeNativeRename(this.id); }
      catch (error) { throw new NativeCleanupError('Native rename cleanup is unconfirmed; retained ' + this.directory, { cause: error }); }
    }
    await removeOwnedDirectory(this.directory);
  }
}
function coordinates(line: number, column: number): void {
  if (!Number.isInteger(line) || !Number.isInteger(column) || line < 1 || column < 1)
    throw new RangeError('Native rename positions are one-based UTF-16 integers.');
}
async function savedTree(root: string): Promise<string> {
  const entries: { path: string; kind: string; bytes?: string; target?: string }[] = [];
  async function visit(directory: string, prefix: string): Promise<void> {
    for (const name of (await readdir(directory)).sort()) {
      const path = prefix ? prefix + '/' + name : name, filename = join(directory, name), info = await lstat(filename);
      if (info.isSymbolicLink()) entries.push({ path, kind: 'symlink', target: await readlink(filename) });
      else if (info.isDirectory()) { entries.push({ path, kind: 'directory' }); await visit(filename, path); }
      else if (info.isFile()) entries.push({ path, kind: 'file', bytes: (await readFile(filename)).toString('base64') });
      else throw new Error('The owned rename tree contains an unsupported entry.');
    }
  }
  await visit(root, ''); return JSON.stringify(entries);
}
