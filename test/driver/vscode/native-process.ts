import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const harness = fileURLToPath(new URL('../../resources/vscode/native-host/run.cjs', import.meta.url));
const temporaryRoot = resolve(tmpdir());
const diagnosticOutputLimit = 16 * 1024;
const ownedDirectories = new Set<string>();
export class NativeCleanupError extends Error {}

/** Owns the SDK launcher and its descendants, including cold download/extraction. */
export class NativeLauncher {
  readonly closed: Promise<void>;
  private readonly exit: Promise<number | null>;
  private stopping: Promise<void> | undefined;
  private readonly output: NativeLauncherOutput;
  private constructor(private readonly child: ChildProcessWithoutNullStreams, private readonly directory: string,
    private readonly inheritedProfileOverrides: { appData: boolean; portable: boolean },
    private readonly launchProfileOverrides: { appData: boolean; portable: boolean }, private readonly diagnosticToken?: string) {
    this.output = new NativeLauncherOutput(diagnosticToken);
    child.stdout.on('data', chunk => this.output.append(String(chunk), 'stdout'));
    child.stderr.on('data', chunk => this.output.append(String(chunk), 'stderr'));
    this.exit = new Promise((resolveExit, reject) => {
      child.once('error', reject);
      child.once('close', resolveExit);
    });
    this.closed = this.exit.then(code => {
      if (code !== 0) throw new Error(`Native VS Code command exited ${code}.\n${this.diagnostics().output}`);
    });
    void this.closed.catch(() => undefined);
  }

  static async start(directory: string, request: Record<string, unknown>, signal?: AbortSignal): Promise<NativeLauncher> {
    const requestPath = join(directory, 'native-request.json');
    await writeFile(requestPath, JSON.stringify(request), { signal });
    signal?.throwIfAborted();
    const inherited = { ...process.env };
    const env = nativeLauncherEnvironment(inherited);
    const child = spawn(process.execPath, [harness, requestPath], {
      env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.end();
    return new NativeLauncher(child, directory, nativeProfileOverrides(inherited), nativeProfileOverrides(env),
      typeof request.token === 'string' ? request.token : undefined);
  }

  /** Actual owned child evidence only; never expose the authentication token. */
  diagnostics(): { output: string; inheritedProfileOverrides: { appData: boolean; portable: boolean }; launchProfileOverrides: { appData: boolean; portable: boolean } } {
    return { output: this.output.read(),
      inheritedProfileOverrides: { ...this.inheritedProfileOverrides }, launchProfileOverrides: { ...this.launchProfileOverrides } };
  }

  async wait(milliseconds = 60_000): Promise<void> {
    try { await within(this.closed, milliseconds, 'Owned VS Code command exceeded its deadline.'); }
    catch (error) { await this.stop(); throw error; }
  }

  stop(): Promise<void> { return this.stopping ??= this.stopOwnedTree(); }
  private async stopOwnedTree(): Promise<void> {
    try {
      if (this.child.pid && this.child.exitCode === null && this.child.signalCode === null) await terminate(this.child.pid);
      await within(this.exit.catch(() => undefined), 2_000, 'Owned launcher did not close after termination.');
    } catch (error) {
      throw new NativeCleanupError(`Native ownership is unconfirmed; retained ${this.directory}.`, { cause: error });
    }
  }
}

export async function within<T>(operation: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
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

export function inside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path !== '' && !isAbsolute(path) && path !== '..' && !path.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'));
}

export async function ownTemporaryDirectory(prefix: string, parent = temporaryRoot): Promise<string> {
  const base = resolve(parent);
  if (base !== temporaryRoot && !ownedDirectories.has(base)) throw new Error('Native child directory requires an owned parent.');
  if (!prefix || basename(prefix) !== prefix || prefix === '.' || prefix === '..') throw new Error('Native directory prefix must be a single name.');
  const directory = resolve(await mkdtemp(join(base, prefix)));
  if (!inside(base, directory)) throw new Error('Native test directory is outside its owned parent.');
  ownedDirectories.add(directory);
  return directory;
}

export async function removeOwnedDirectory(directory: string): Promise<void> {
  const absolute = resolve(directory);
  if (!ownedDirectories.has(absolute) || !inside(temporaryRoot, absolute)) {
    throw new Error('Refusing to remove a directory not owned by this native test.');
  }
  await rm(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  for (const owned of ownedDirectories) if (owned === absolute || inside(absolute, owned)) ownedDirectories.delete(owned);
}

/** The actual owned launcher environment; never inherit another VS Code instance. */
export function nativeLauncherEnvironment(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...environment };
  const overrides = new Set(['ELECTRON_RUN_AS_NODE', 'VSCODE_IPC_HOOK_CLI', 'VSCODE_APPDATA', 'VSCODE_PORTABLE']);
  // Windows environment names ignore case; VS Code profile overrides precede --user-data-dir.
  for (const key of Object.keys(env)) if (overrides.has(key.toUpperCase())) delete env[key];
  return env;
}
function nativeProfileOverrides(environment: NodeJS.ProcessEnv): { appData: boolean; portable: boolean } {
  const present = (name: string) => Object.entries(environment).some(([key, value]) => key.toUpperCase() === name && Boolean(value));
  return { appData: present('VSCODE_APPDATA'), portable: present('VSCODE_PORTABLE') };
}

/** Redacts each native stream before retention; incomplete token prefixes stay private. */
export class NativeLauncherOutput {
  private output = '';
  private discardedOutput = 0;
  private readonly pending = { stdout: '', stderr: '' };
  constructor(private readonly token?: string) {}
  append(chunk: string, stream: 'stdout' | 'stderr' = 'stdout'): void {
    let safe = chunk;
    if (this.token) {
      safe = (this.pending[stream] + chunk).replaceAll(this.token, '[redacted session token]');
      let prefixLength = Math.min(this.token.length - 1, safe.length);
      while (prefixLength > 0 && !this.token.startsWith(safe.slice(-prefixLength))) prefixLength--;
      this.pending[stream] = prefixLength ? safe.slice(-prefixLength) : '';
      if (prefixLength) safe = safe.slice(0, -prefixLength);
    }
    const output = this.output + safe;
    this.discardedOutput += Math.max(0, output.length - diagnosticOutputLimit);
    this.output = output.slice(-diagnosticOutputLimit);
  }
  read(): string {
    const withheld = this.pending.stdout || this.pending.stderr ? '[Possible incomplete session-token prefix withheld.]' : '';
    return (this.discardedOutput ? '[Native launcher output truncated: ' + this.discardedOutput + ' earlier redacted characters discarded.]\n' : '') + this.output + withheld;
  }
}
