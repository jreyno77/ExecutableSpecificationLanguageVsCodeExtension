import { afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../../../', import.meta.url));
const harness = join(project, 'test/resources/vscode/native-host');
const cachePath = join(tmpdir(), 'expec-vscode-electron-cache');
const version = '1.100.0';
const temporaryRoot = resolve(tmpdir());
const ownedDirectories = new Set<string>();
let installation: Promise<InstalledExpecEditor> | undefined;
afterAll(async () => { await (await installation?.catch(() => undefined))?.dispose(); });

/** Real VSIX installation is shared; every opened document owns its host/profile. */
export class InstalledExpecEditor {
  private readonly activeOpens = new Set<Promise<string>>();
  private disposal: Promise<void> | undefined;
  private cleanupUnconfirmed = false;
  private constructor(
    private readonly directory: string,
    private readonly executable: string,
    private readonly extensionId: string,
    private readonly extensionPath: string,
    private readonly manifest: { contributes?: { grammars?: { language: string; scopeName: string; path: string }[] } },
  ) {}

  static prepare(): Promise<InstalledExpecEditor> {
    return installation ??= this.install();
  }

  private static async install(): Promise<InstalledExpecEditor> {
    const directory = await ownTemporaryDirectory('expec-installed-syntax-');
    try {
      const { createVSIX } = await import('@vscode/vsce');
      const manifest = JSON.parse(await readFile(join(project, 'package.json'), 'utf8'));
      const extensionId = `${manifest.publisher}.${manifest.name}`;
      const receiptPath = join(directory, 'installation.json');
      const packagePath = join(directory, 'expec.vsix');
      await createVSIX({ cwd: project, packagePath, dependencies: false });
      await nativeCommand(directory, {
        command: 'install', packagePath, version, cachePath, receiptPath,
        extensionsDirectory: join(directory, 'extensions'),
        userDataDirectory: join(directory, 'install-profile'),
      });
      const { executable } = JSON.parse(await readFile(receiptPath, 'utf8'));
      if (typeof executable !== 'string' || !isAbsolute(executable) || !inside(resolve(cachePath), resolve(executable))) {
        throw new Error('The owned installer did not report its pinned VS Code executable.');
      }
      for (const entry of await readdir(join(directory, 'extensions'), { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const extensionPath = join(directory, 'extensions', entry.name);
        const installed = JSON.parse(await readFile(join(extensionPath, 'package.json'), 'utf8'));
        if (`${installed.publisher}.${installed.name}` === extensionId && installed.version === manifest.version) {
          return new InstalledExpecEditor(directory, executable, extensionId, extensionPath, installed);
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
    const source = await readFile(join(project, 'src/vscode/syntax/expec.tmLanguage.json'));
    if (!bytes.equals(source)) throw new Error('The installed VSIX changed the language-produced grammar.');
    return { text: bytes.toString('utf8'), path, scopeName: contribution.scopeName };
  }

  open(fileName: string, text: string): Promise<string> {
    if (this.disposal) return Promise.reject(new Error('The installed syntax editor is disposing.'));
    const operation = this.openDocument(fileName, text);
    this.activeOpens.add(operation);
    void operation.then(() => this.activeOpens.delete(operation), () => this.activeOpens.delete(operation));
    return operation;
  }

  private async openDocument(fileName: string, text: string): Promise<string> {
    if (basename(fileName) !== fileName || fileName === '.' || fileName === '..') {
      throw new Error('Open a single test-owned file name.');
    }
    const directory = await ownTemporaryDirectory('expec-syntax-document-');
    let cleanupUnconfirmed = false;
    try {
      const file = join(directory, fileName);
      const receiptPath = join(directory, 'observation.json');
      await writeFile(file, text);
      await nativeCommand(directory, {
        command: 'open', executable: this.executable, extensionId: this.extensionId,
        extensionPath: this.extensionPath, file, receiptPath,
        extensionsDirectory: join(this.directory, 'extensions'),
        userDataDirectory: join(directory, 'profile'),
      });
      const actual = JSON.parse(await readFile(receiptPath, 'utf8'));
      if (actual.file !== file || actual.text !== text || actual.extensionId !== this.extensionId
        || resolve(actual.extensionPath) !== resolve(this.extensionPath) || typeof actual.languageId !== 'string') {
        throw new Error('The native host did not observe the requested installed extension and document.');
      }
      return actual.languageId;
    } catch (error) {
      if (error instanceof NativeCleanupError) this.cleanupUnconfirmed = cleanupUnconfirmed = true;
      throw error;
    } finally {
      if (!cleanupUnconfirmed) await removeOwnedDirectory(directory);
    }
  }

  dispose(): Promise<void> {
    return this.disposal ??= this.finishDisposal();
  }

  private async finishDisposal(): Promise<void> {
    await within(Promise.allSettled([...this.activeOpens]), 70_000, 'Active native hosts did not settle before disposal.');
    if (this.cleanupUnconfirmed) {
      throw new Error(`Native host cleanup is unconfirmed; retained installation ${this.directory}.`);
    }
    await removeOwnedDirectory(this.directory);
  }
}

function inside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path !== '' && !isAbsolute(path) && path !== '..' && !path.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'));
}

/** The SDK owns VS Code; this launcher gives the test ownership of that entire tree. */
async function nativeCommand(directory: string, request: Record<string, unknown>): Promise<void> {
  const requestPath = join(directory, 'native-request.json');
  await writeFile(requestPath, JSON.stringify(request));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VSCODE_IPC_HOOK_CLI;
  const child = spawn(process.execPath, [join(harness, 'run.cjs'), requestPath], {
    env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const closed = new Promise<number | null>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', resolveExit);
  });
  try {
    const code = await within(closed, 60_000, 'Owned VS Code command exceeded 60 seconds.');
    if (code !== 0) throw new Error(`Native VS Code command exited ${code}.\n${output}`);
  } catch (error) {
    try {
      if (child.pid && child.exitCode === null && child.signalCode === null) await terminate(child.pid);
      await within(closed.catch(() => undefined), 2_000, 'Owned launcher did not close after termination.');
    } catch (cleanupError) {
      throw new NativeCleanupError(`Native ownership is unconfirmed; retained ${directory}.`, {
        cause: new AggregateError([error, cleanupError]),
      });
    }
    throw error;
  }
}

class NativeCleanupError extends Error {}

async function within<T>(operation: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

async function terminate(pid: number): Promise<void> {
  if (process.platform !== 'win32') {
    try { process.kill(-pid, 'SIGKILL'); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
    return;
  }
  const child = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  const closed = new Promise<number | null>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', resolveExit);
  });
  try {
    const code = await within(closed, 5_000, 'Owned taskkill command exceeded five seconds.');
    if (code !== 0) throw new Error(`Could not terminate owned process tree ${pid}: taskkill exited ${code}.`);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}
async function ownTemporaryDirectory(prefix: string): Promise<string> {
  const directory = resolve(await mkdtemp(join(temporaryRoot, prefix)));
  if (!inside(temporaryRoot, directory)) throw new Error('Native test directory is outside its temporary root.');
  ownedDirectories.add(directory);
  return directory;
}

async function removeOwnedDirectory(directory: string): Promise<void> {
  const absolute = resolve(directory);
  if (!ownedDirectories.has(absolute) || !inside(temporaryRoot, absolute)) {
    throw new Error('Refusing to remove a directory not owned by this native test.');
  }
  await rm(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  ownedDirectories.delete(absolute);
}