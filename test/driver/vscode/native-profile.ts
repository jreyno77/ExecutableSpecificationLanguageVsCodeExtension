import childProcess, { type SpawnOptionsWithoutStdio } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { vi } from 'vitest';
import { NativeLauncher, ownTemporaryDirectory, removeOwnedDirectory } from './native-process.js';

type ProfileEntry = { path: string; kind: 'directory' } | { path: string; kind: 'file'; bytes: string };

/** Observes the actual launch request and filesystem before forwarding an owned Node child. */
export class NativeProfileLaunch {
  readonly profile: string;
  private readonly restoreSpawn: () => void;
  private launcher: NativeLauncher | undefined;
  private spawned = 0;
  private observedProfile: string | undefined;
  private observedDirectory = false;
  private observedTree: readonly ProfileEntry[] | undefined;

  private constructor(private readonly directory: string) {
    this.profile = join(directory, 'profile');
    const actualSpawn = childProcess.spawn;
    const observed = vi.spyOn(childProcess, 'spawn').mockImplementation((command, args, options) => {
      if (command !== process.execPath || !Array.isArray(args) || typeof args[1] !== 'string') {
        throw new Error('Expected the actual native launcher request.');
      }
      const request = JSON.parse(readFileSync(args[1], 'utf8')) as Record<string, unknown>;
      if (typeof request.userDataDirectory !== 'string') throw new Error('Actual launch request has no profile.');
      this.observedProfile = request.userDataDirectory;
      try {
        this.observedDirectory = lstatSync(this.observedProfile).isDirectory();
        if (this.observedDirectory) this.observedTree = profileTree(this.observedProfile);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      this.spawned++;
      // Forward a real child with the actual options; only its workload avoids Electron setup.
      return actualSpawn(command, ['-e', 'process.exit(0)'], options as SpawnOptionsWithoutStdio);
    });
    syncBuiltinESMExports();
    this.restoreSpawn = () => { observed.mockRestore(); syncBuiltinESMExports(); };
  }

  static async prepare(): Promise<NativeProfileLaunch> {
    return new NativeProfileLaunch(await ownTemporaryDirectory('expec-native-profile-control-'));
  }
  async start(): Promise<void> {
    this.launcher = await NativeLauncher.start(this.directory, { mode: 'run', userDataDirectory: this.profile });
  }
  async startFailure(): Promise<unknown> {
    try { await this.start(); } catch (error) { return error; }
    throw new Error(`Profile preparation should reject; the actual launcher started ${this.spawned} child.`);
  }
  async closed(): Promise<void> { await this.launcher!.wait(2_000); }
  profileDirectoryAtSpawn(): boolean { return this.observedDirectory; }
  requestedProfileAtSpawn(): string | undefined { return this.observedProfile; }
  childCount(): number { return this.spawned; }
  profileTreeAtSpawn(): readonly ProfileEntry[] | undefined { return this.observedTree; }
  async profileTree(): Promise<readonly ProfileEntry[]> { return profileTree(this.profile); }
  async profileFile(path: string, bytes: string): Promise<void> {
    const segments = path.split('/');
    await mkdir(join(this.profile, ...segments.slice(0, -1)), { recursive: true });
    await writeFile(join(this.profile, ...segments), bytes);
  }
  async profilePathIsFile(bytes: string): Promise<void> { await writeFile(this.profile, bytes); }
  async profilePathBytes(): Promise<string> { return readFile(this.profile, 'utf8'); }
  async dispose(): Promise<void> {
    this.restoreSpawn();
    // A failed stop keeps the tree, following the existing native ownership boundary.
    if (this.launcher) { await this.launcher.wait(2_000); await this.launcher.stop(); }
    await removeOwnedDirectory(this.directory);
  }
}

function profileTree(root: string): readonly ProfileEntry[] {
  const entries: ProfileEntry[] = [];
  const visit = (directory: string, prefix: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name), path = prefix + name, stat = lstatSync(absolute);
      if (stat.isDirectory()) {
        entries.push({ path, kind: 'directory' }); visit(absolute, path + '/');
      } else if (stat.isFile()) {
        entries.push({ path, kind: 'file', bytes: readFileSync(absolute).toString('hex') });
      } else throw new Error('Unexpected entry in the owned profile: ' + path);
    }
  };
  visit(root, '');
  return entries;
}
