import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { NativeCleanupError, ownTemporaryDirectory, removeOwnedDirectory } from './native-process.js';
import { type DiagnosticObservation, VsCodeSession } from './vscode-session.js';

/** One test-owned document; the installation and native host have suite ownership. */
export class DiagnosticDocument {
  private readonly id = randomUUID();
  private directory: string | undefined;
  private session: VsCodeSession | undefined;
  private opening: Promise<void> | undefined;
  private disposal: Promise<void> | undefined;
  constructor(private readonly getSession: () => Promise<VsCodeSession>, private readonly extensionId: string,
    private readonly fileName: string, private readonly initialText: string, private readonly dependencyText?: string | null) {}

  open(): Promise<void> { return this.opening ??= this.openOwnedDocument(); }
  private async openOwnedDocument(): Promise<void> {
    const untitled = this.fileName.startsWith('untitled:');
    if (!untitled && (basename(this.fileName) !== this.fileName || this.fileName === '.' || this.fileName === '..')) {
      throw new Error('Open a single test-owned file name.');
    }
    this.directory = await ownTemporaryDirectory('expec-diagnostic-document-');
    const file = untitled ? undefined : join(this.directory, this.fileName);
    if (file) await writeFile(file, this.initialText);
    const dependencyFile = this.dependencyText === undefined ? undefined : join(this.directory, 'book.expec');
    if (dependencyFile && this.dependencyText !== null) await writeFile(dependencyFile, this.dependencyText!);
    this.session = await this.getSession();
    await this.session.openDiagnosticDocument(this.id, this.extensionId, { file, text: this.initialText, untitled, dependencyFile });
  }
  async edit(text: string): Promise<DiagnosticObservation> { return this.editTexts([text]); }
  async editQuickly(first: string, latest: string): Promise<DiagnosticObservation> { return this.editTexts([first, latest]); }
  private async editTexts(texts: readonly string[]): Promise<DiagnosticObservation> {
    if (this.disposal) throw new Error('The owned diagnostic document is disposing.');
    await this.open();
    return this.session!.editDiagnosticDocument(this.id, texts);
  }
  async changeDependency(text: string | null): Promise<DiagnosticObservation> {
    if (this.disposal) throw new Error('The owned diagnostic document is disposing.');
    await this.open();
    return this.session!.changeDiagnosticDependency(this.id, text);
  }
  async observation(): Promise<DiagnosticObservation> {
    await this.open();
    return this.session!.observeDiagnosticDocument(this.id);
  }
  async close(): Promise<DiagnosticObservation> {
    await this.open();
    return this.session!.closeDiagnosticDocument(this.id);
  }
  dispose(): Promise<void> { return this.disposal ??= this.disposeOwnedDocument(); }
  private async disposeOwnedDocument(): Promise<void> {
    await this.opening?.catch(() => undefined);
    try { await this.session?.disposeDiagnosticDocument(this.id); }
    catch (error) { throw new NativeCleanupError('Owned diagnostic document cleanup is unconfirmed; retained ' + this.directory, { cause: error }); }
    if (this.directory) await removeOwnedDirectory(this.directory);
  }
}
