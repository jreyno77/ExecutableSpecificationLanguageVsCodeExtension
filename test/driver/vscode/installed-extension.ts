import { afterAll, onTestFinished } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeCleanupError, NativeLauncher, inside, ownTemporaryDirectory, removeOwnedDirectory, within } from './native-process.js';
import { VsCodeSession, type DiagnosticMiddlewareObservation } from './vscode-session.js';
import { DiagnosticDocument } from './diagnostic-document.js';
import { ConnectionSidebarCase } from './connection-sidebar.js';
import { NativePreviewCase } from './native-preview.js';
import { NativeGenerationCase } from './native-generation.js';

const project = fileURLToPath(new URL('../../../', import.meta.url));
const cachePath = join(tmpdir(), 'expec-vscode-electron-cache');
let installation: Promise<InstalledExpecEditor> | undefined;
afterAll(async () => { await (await installation?.catch(() => undefined))?.dispose(); }, 90_000);

/** Once for this native suite file; adding isolated files requires project-level ownership. */
export class InstalledExpecEditor {
  private readonly activeOpens = new Set<Promise<string>>();
  private readonly diagnosticDocuments = new Set<DiagnosticDocument>();
  private readonly connectionSidebars = new Set<ConnectionSidebarCase>();
  private readonly previewEditors = new Set<NativePreviewCase>();
  private readonly generationEditors = new Set<NativeGenerationCase>();
  private session: Promise<VsCodeSession> | undefined;
  private activeSession: VsCodeSession | undefined;
  private disposal: Promise<void> | undefined;
  private cleanupUnconfirmed = false;
  private constructor(
    private readonly directory: string, private readonly workspace: string, private readonly executable: string,
    private readonly extensionId: string, private readonly extensionPath: string,
    private readonly manifest: { contributes?: { grammars?: { language: string; scopeName: string; path: string }[] } },
  ) {}

  static prepare(): Promise<InstalledExpecEditor> { return installation ??= this.install(); }
  private static async install(): Promise<InstalledExpecEditor> {
    const directory = await ownTemporaryDirectory('expec-installed-syntax-');
    try {
      const workspace = await ownTemporaryDirectory('workspace-', directory);
      const { createVSIX } = await import('@vscode/vsce');
      const manifest = JSON.parse(await readFile(join(project, 'package.json'), 'utf8'));
      const extensionId = `${manifest.publisher}.${manifest.name}`;
      const receiptPath = join(directory, 'installation.json');
      const packagePath = join(directory, 'expec.vsix');
      await createVSIX({ cwd: project, packagePath, dependencies: false });
      console.info('Owned native VSIX:', JSON.stringify({ path: packagePath,
        sha256: createHash('sha256').update(await readFile(packagePath)).digest('hex'),
        entrySha256: createHash('sha256').update(await readFile(join(project, manifest.main))).digest('hex') }));
      await (await NativeLauncher.start(directory, {
        command: 'install', packagePath, version: '1.100.0', cachePath, receiptPath,
        extensionsDirectory: join(directory, 'extensions'), userDataDirectory: join(directory, 'install-profile'),
      })).wait();
      const { executable } = JSON.parse(await readFile(receiptPath, 'utf8'));
      if (typeof executable !== 'string' || !isAbsolute(executable) || !inside(resolve(cachePath), resolve(executable))) {
        throw new Error('The owned installer did not report its pinned VS Code executable.');
      }
      for (const entry of await readdir(join(directory, 'extensions'), { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const extensionPath = join(directory, 'extensions', entry.name);
        const installed = JSON.parse(await readFile(join(extensionPath, 'package.json'), 'utf8'));
        if (`${installed.publisher}.${installed.name}` === extensionId && installed.version === manifest.version) {
          return new InstalledExpecEditor(directory, workspace, executable, extensionId, extensionPath, installed);
        }
      }
      throw new Error(`The VSIX installer did not install ${extensionId}@${manifest.version}.`);
    } catch (error) {
      if (!(error instanceof NativeCleanupError)) await removeOwnedDirectory(directory);
      throw error;
    }
  }

  async grammar(): Promise<{ text: string; path: string; scopeName: string }> {
    const contribution = this.manifest.contributes?.grammars?.find(grammar => grammar.language === 'expec');
    if (!contribution) throw new Error('The installed VSIX has no expec grammar contribution.');
    const path = resolve(this.extensionPath, contribution.path);
    if (!inside(this.extensionPath, path)) throw new Error('The installed grammar is outside its extension.');
    const bytes = await readFile(path);
    if (!bytes.equals(await readFile(join(project, 'src/vscode/syntax/expec.tmLanguage.json')))) {
      throw new Error('The installed VSIX changed the language-produced grammar.');
    }
    return { text: bytes.toString('utf8'), path, scopeName: contribution.scopeName };
  }

  open(fileName: string, text: string): Promise<string> {
    if (this.disposal) return Promise.reject(new Error('The installed syntax editor is disposing.'));
    const operation = this.openDocument(fileName, text);
    this.activeOpens.add(operation);
    void operation.then(() => this.activeOpens.delete(operation), () => this.activeOpens.delete(operation));
    return operation;
  }

  async missingDocumentDiagnostics(): Promise<DiagnosticMiddlewareObservation> {
    if (this.disposal) throw new Error('The installed syntax editor is disposing.');
    return (await this.nativeSession()).missingDocumentDiagnostics(this.extensionId);
  }

  async diagnosticDocument(fileName: string, initialText: string, dependencyText?: string | null): Promise<DiagnosticDocument> {
    if (this.disposal) throw new Error('The installed syntax editor is disposing.');
    const document = new DiagnosticDocument(() => this.nativeSession(), this.extensionId, fileName, initialText, dependencyText, this.workspace);
    this.diagnosticDocuments.add(document);
    onTestFinished(async () => {
      await document.dispose(); this.diagnosticDocuments.delete(document);
    }, 40_000);
    try { await document.open(); return document; }
    catch (error) {
      await document.dispose(); this.diagnosticDocuments.delete(document); throw error;
    }
  }

  async connectionSidebar(configuration: string | undefined, directories: readonly string[]): Promise<ConnectionSidebarCase> {
    if (this.disposal) throw new Error('The installed syntax editor is disposing.');
    const sidebar = new ConnectionSidebarCase(() => this.nativeSession(), this.extensionId, configuration, directories, this.workspace);
    this.connectionSidebars.add(sidebar);
    onTestFinished(async () => { await sidebar.dispose(); this.connectionSidebars.delete(sidebar); }, 40_000);
    try { await sidebar.open(); return sidebar; }
    catch (error) { await sidebar.dispose(); this.connectionSidebars.delete(sidebar); throw error; }
  }

  private async nativeSession(): Promise<VsCodeSession> {
    return this.session ??= (async () => {
      const session = this.activeSession = await VsCodeSession.start(this.executable, join(this.directory, 'extensions'), this.workspace);
      if (this.disposal) { await session.dispose(); throw new Error('The installed syntax editor is disposing.'); }
      const path = await session.extensionPath(this.extensionId);
      if (!path || resolve(path) !== resolve(this.extensionPath)) throw new Error('VS Code did not load the VSIX-installed product.');
      return session;
    })();
  }

  async previewEditor(initialText: string, configuration: string): Promise<NativePreviewCase> {
    if (this.disposal) throw new Error('The installed syntax editor is disposing.');
    const editor = new NativePreviewCase(() => this.nativeSession(), this.extensionId, initialText, configuration, this.workspace);
    this.previewEditors.add(editor);
    onTestFinished(async () => { await editor.dispose(); this.previewEditors.delete(editor); }, 40_000);
    try { await editor.open(); return editor; }
    catch (error) {
      try { await editor.dispose(); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Native preview setup failed: ' + String(error) + '; cleanup failed: ' + String(cleanupError), { cause: error }); }
      this.previewEditors.delete(editor); throw error;
    }
  }

  async generationEditor(source: string, otherEntry: string, enabled: boolean, outputs = false, missingRuntime = false): Promise<NativeGenerationCase> {
    if (this.disposal) throw new Error('The installed editor is disposing.');
    const editor = new NativeGenerationCase(() => this.nativeSession(), this.extensionId, source, otherEntry, enabled, outputs, missingRuntime, this.workspace);
    this.generationEditors.add(editor);
    onTestFinished(async () => { await editor.dispose(); this.generationEditors.delete(editor); }, 70_000);
    try { await editor.open(); return editor; }
    catch (error) {
      try { await editor.dispose(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Native generation setup and cleanup failed', { cause: error }); }
      this.generationEditors.delete(editor); throw error;
    }
  }

  private async openDocument(fileName: string, text: string): Promise<string> {
    if (basename(fileName) !== fileName || fileName === '.' || fileName === '..') throw new Error('Open a single test-owned file name.');
    const directory = await ownTemporaryDirectory('expec-syntax-document-', this.workspace);
    let cleanupUnconfirmed = false;
    try {
      const file = join(directory, fileName);
      await writeFile(file, text);
      if (this.disposal) throw new Error('The installed syntax editor is disposing.');
      const session = await this.nativeSession();
      if (this.disposal) throw new Error('The installed syntax editor is disposing.');
      const actual = await session.readDocument(file);
      if (documentPath(actual.file) !== documentPath(file) || actual.text !== text) {
        throw new Error('The native host did not read the requested document: ' + JSON.stringify({ requested: file, actual: actual.file, sameText: actual.text === text }));
      }
      return actual.languageId;
    } catch (error) {
      if (error instanceof NativeCleanupError) this.cleanupUnconfirmed = cleanupUnconfirmed = true;
      throw error;
    } finally { if (!cleanupUnconfirmed) await removeOwnedDirectory(directory); }
  }

  dispose(): Promise<void> { return this.disposal ??= this.finishDisposal(); }
  private async finishDisposal(): Promise<void> {
    await within(Promise.allSettled([...this.activeOpens]), 70_000, 'Active native observations did not settle before disposal.');
    try {
      try {
        const documents = await Promise.allSettled([...this.diagnosticDocuments].map(document => document.dispose())
          .concat([...this.connectionSidebars].map(sidebar => sidebar.dispose()), [...this.previewEditors].map(editor => editor.dispose()), [...this.generationEditors].map(editor => editor.dispose())));
        const failed = documents.find(result => result.status === 'rejected');
        if (failed?.status === 'rejected') throw failed.reason;
      } finally { await this.activeSession?.dispose(); }
    } catch (error) { if (error instanceof NativeCleanupError) this.cleanupUnconfirmed = true; throw error; }
    finally {
      if (this.cleanupUnconfirmed) throw new Error('Native host cleanup is unconfirmed; retained installation ' + this.directory + '.');
      await removeOwnedDirectory(this.directory);
    }
  }
}
function documentPath(file: string): string {
  const path = resolve(file);
  return process.platform === 'win32' && path[1] === ':' ? path[0].toUpperCase() + path.slice(1) : path;
}
