import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { NativeCleanupError, ownTemporaryDirectory, removeOwnedDirectory } from './native-process.js';
import { type SidebarObservation, VsCodeSession } from './vscode-session.js';

/** One mutable sidebar case, sharing the suite-owned installed extension host. */
export class ConnectionSidebarCase {
  private readonly id = randomUUID();
  private directory: string | undefined;
  private session: VsCodeSession | undefined;
  private opening: Promise<void> | undefined;
  private disposal: Promise<void> | undefined;
  private actual: SidebarObservation | undefined;
  private setupFailure: unknown;
  constructor(private readonly getSession: () => Promise<VsCodeSession>, private readonly extensionId: string,
    private readonly configuration: string | undefined, private readonly directories: readonly string[], private readonly workspace: string) {}

  get last(): SidebarObservation { if (!this.actual) throw new Error('No actual native sidebar observation.'); return this.actual; }
  open(): Promise<void> { return this.opening ??= this.openOwnedSidebar(); }
  private async openOwnedSidebar(): Promise<void> {
    for (const name of this.directories) if (basename(name) !== name || name === '.' || name === '..') throw new Error('Use one owned project directory name.');
    this.directory = await ownTemporaryDirectory('expec-connection-sidebar-', this.workspace);
    await Promise.all(this.directories.map(name => mkdir(join(this.directory!, name))));
    const file = join(this.directory, 'expec.json');
    if (this.configuration !== undefined) await writeFile(file, this.configuration);
    try { this.session = await this.getSession(); }
    catch (error) { if (error instanceof NativeCleanupError) this.setupFailure = error; throw error; }
    try {
      this.actual = await this.session.openConnectionSidebar(this.id, this.extensionId,
        { file, directory: this.directory, resetFile: join(this.workspace, 'expec.json') });
    } catch (error) { this.setupFailure = error; throw error; }
  }
  async observe(): Promise<void> {
    if (this.disposal) throw new Error('The owned sidebar is disposing.');
    await this.open(); this.actual = await this.session!.observeConnectionSidebar(this.id);
  }
  choose(name: string): Promise<void> { return this.action('choose', name); }
  save(text: string): Promise<void> { return this.action('save', undefined, text); }
  remove(name: string): Promise<void> { return this.action('remove', name); }
  restore(name: string): Promise<void> { return this.action('restore', name); }
  edit(text: string): Promise<void> { return this.action('edit', undefined, text); }
  private async action(kind: 'choose' | 'save' | 'remove' | 'restore' | 'edit', name?: string, text?: string): Promise<void> {
    if (this.disposal) throw new Error('The owned sidebar is disposing.');
    await this.open(); this.actual = await this.session!.changeConnectionSidebar(this.id, kind, name, text);
  }
  dispose(): Promise<void> { return this.disposal ??= this.disposeOwnedSidebar(); }
  private async disposeOwnedSidebar(): Promise<void> {
    await this.opening?.catch(() => undefined);
    if (this.setupFailure) throw new NativeCleanupError('Native sidebar setup cleanup is unconfirmed; retained ' + this.directory, { cause: this.setupFailure });
    try { await this.session?.disposeConnectionSidebar(this.id); }
    catch (error) { throw new NativeCleanupError('Owned sidebar cleanup is unconfirmed; retained ' + this.directory, { cause: error }); }
    if (this.directory) await removeOwnedDirectory(this.directory);
  }
}
