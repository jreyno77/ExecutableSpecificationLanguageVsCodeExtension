import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const harness = fileURLToPath(new URL('../../resources/vscode/native-host/run.cjs', import.meta.url));
const temporaryRoot = resolve(tmpdir());
const ownedDirectories = new Set<string>();
export class NativeCleanupError extends Error {}

/** Owns the SDK launcher and its descendants, including cold download/extraction. */
export class NativeLauncher {
  readonly closed: Promise<void>;
  private readonly exit: Promise<number | null>;
  private stopping: Promise<void> | undefined;
  private output = '';
  private constructor(private readonly child: ChildProcessWithoutNullStreams, private readonly directory: string) {
    child.stdout.on('data', chunk => { this.output += chunk; });
    child.stderr.on('data', chunk => { this.output += chunk; });
    this.exit = new Promise((resolveExit, reject) => {
      child.once('error', reject);
      child.once('close', resolveExit);
    });
    this.closed = this.exit.then(code => {
      if (code !== 0) throw new Error(`Native VS Code command exited ${code}.\n${this.output}`);
    });
    void this.closed.catch(() => undefined);
  }

  static async start(directory: string, request: Record<string, unknown>, signal?: AbortSignal): Promise<NativeLauncher> {
    const requestPath = join(directory, 'native-request.json');
    await writeFile(requestPath, JSON.stringify(request), { signal });
    signal?.throwIfAborted();
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.VSCODE_IPC_HOOK_CLI;
    const child = spawn(process.execPath, [harness, requestPath], {
      env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.end();
    return new NativeLauncher(child, directory);
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

export async function ownTemporaryDirectory(prefix: string): Promise<string> {
  const directory = resolve(await mkdtemp(join(temporaryRoot, prefix)));
  if (!inside(temporaryRoot, directory)) throw new Error('Native test directory is outside its temporary root.');
  ownedDirectories.add(directory);
  return directory;
}

export async function removeOwnedDirectory(directory: string): Promise<void> {
  const absolute = resolve(directory);
  if (!ownedDirectories.has(absolute) || !inside(temporaryRoot, absolute)) {
    throw new Error('Refusing to remove a directory not owned by this native test.');
  }
  await rm(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  ownedDirectories.delete(absolute);
}