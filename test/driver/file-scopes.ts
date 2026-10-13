import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, readlink, realpath, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { onTestFinished } from 'vitest';
import { ConfigurationReader, SourceLoader, type ScopedPackageRequirement, type SourceLoad } from 'executable-specification-language';
import { DocumentAnalysis } from '../../src/core/DocumentAnalysis.js';
import type { ConnectionConfiguration } from '../../src/core/ConnectionConfiguration.js';
import type { DocumentReport } from '../../src/core/DocumentReport.js';
import type { SourceDocument } from '../../src/core/SourceDocument.js';
import { FileSources } from '../../src/vscode/FileSources.js';
import { inside, ownTemporaryDirectory, removeOwnedDirectory } from './vscode/native-process.js';

type DirectoryIdentity = { directory: string; dev: bigint; ino: bigint };

/** Owns tiny literal filesystem fixtures and observes the real public source boundaries. */
export class FileScopes {
  readonly manifest: string;
  private readonly files = new FileSources();
  private readonly directories: DirectoryIdentity[] = [];
  private baseline: Map<string, string> | undefined;
  private outside: string | undefined;
  private queryFile: string | undefined;
  private queryResult: string | undefined;
  private input: { configuration: ConnectionConfiguration; source: SourceDocument } | undefined;
  private captured: SourceLoad | undefined;
  private live: DocumentReport | undefined;
  private disposed = false;

  private constructor(readonly directory: string) { this.manifest = join(directory, 'expec.json'); }

  static async open(): Promise<FileScopes> {
    const directory = await ownTemporaryDirectory('expec-file-scopes-');
    const recording = new FileScopes(directory);
    onTestFinished(() => recording.dispose());
    const stat = await lstat(directory, { bigint: true });
    recording.directories.push({ directory, dev: stat.dev, ino: stat.ino });
    return recording;
  }

  static async comparison(configuration: ConnectionConfiguration, sourcePath: string, text: string): Promise<FileScopes> {
    const recording = await FileScopes.open();
    if (configuration.text === undefined) throw new TypeError('The scoped comparison needs actual saved configuration text.');
    await recording.keepSource('expec.json', configuration.text);
    await recording.keepSource(sourcePath, text);
    const sourceFile = await realpath(recording.fixture(recording.directory, sourcePath));
    recording.input = {
      configuration: { file: recording.manifest, text: configuration.text, writable: configuration.writable },
      source: { uri: pathToFileURL(sourceFile).href, text },
    };
    return recording;
  }

  private fixture(directory: string, name: string): string {
    if (!name || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new TypeError('Arrange a literal relative fixture path.');
    }
    const file = resolve(directory, name);
    if (!inside(directory, file)) throw new Error('Fixture path escapes its owned directory.');
    return file;
  }

  private arranging(): void {
    if (this.baseline !== undefined) throw new Error('Fixture arrangement cannot replace a baseline after a public source query.');
  }

  private async folder(directory: string, selected: string): Promise<void> {
    let current = directory;
    for (const part of relative(directory, selected).split(sep).filter(Boolean)) {
      current = join(current, part);
      try { await mkdir(current); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      const stat = await lstat(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Fixture parents must be ordinary owned directories.');
    }
  }

  async keepSource(name: string, text: string): Promise<void> {
    this.arranging();
    const file = this.fixture(this.directory, name);
    await this.folder(this.directory, dirname(file));
    await writeFile(file, text, { encoding: 'utf8', flag: 'wx' });
  }

  async keepFolder(name: string): Promise<void> {
    this.arranging();
    await this.folder(this.directory, this.fixture(this.directory, name));
  }

  async keepEscapingLink(linkPath: string, outsidePath: string, text: string): Promise<void> {
    this.arranging();
    if (this.outside !== undefined) throw new Error('The literal fixture owns one escaping link.');
    this.outside = await ownTemporaryDirectory('expec-file-scopes-outside-');
    const stat = await lstat(this.outside, { bigint: true });
    this.directories.push({ directory: this.outside, dev: stat.dev, ino: stat.ino });
    const outsideFile = this.fixture(this.outside, outsidePath);
    await this.folder(this.outside, dirname(outsideFile));
    await writeFile(outsideFile, text, { encoding: 'utf8', flag: 'wx' });
    const link = this.fixture(this.directory, linkPath);
    await this.folder(this.directory, dirname(link));
    await symlink(this.outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  }

  private async tree(): Promise<Map<string, string>> {
    const entries = new Map<string, string>();
    const visit = async (directory: string, name: string): Promise<void> => {
      const stat = await lstat(directory, { bigint: true });
      const identity = `${stat.dev}:${stat.ino}:${stat.mode}:${stat.mtimeNs}:${stat.ctimeNs}`;
      if (stat.isSymbolicLink()) { entries.set(name, `link:${identity}:${await readlink(directory)}`); return; }
      if (stat.isDirectory()) {
        entries.set(name, `directory:${identity}`);
        for (const child of (await readdir(directory)).sort()) await visit(join(directory, child), name + '/' + child);
      } else if (stat.isFile()) {
        entries.set(name, `file:${identity}:${createHash('sha256').update(await readFile(directory)).digest('hex')}`);
      } else throw new Error('Unexpected route in the owned source fixture.');
    };
    await visit(this.directory, 'source');
    if (this.outside !== undefined) await visit(this.outside, 'outside');
    return entries;
  }

  private async seal(): Promise<void> {
    if (this.baseline === undefined) this.baseline = await this.tree();
  }

  async query(name: string): Promise<void> {
    const file = this.fixture(this.directory, name);
    await this.seal();
    this.queryFile = file;
    this.queryResult = this.files.localPath(pathToFileURL(file).href, this.manifest);
  }

  queriedPath(): string | undefined {
    if (this.queryFile === undefined) throw new Error('No actual native scope query has completed.');
    return this.queryResult;
  }
  available(): boolean { return this.queriedPath() !== undefined; }

  async queriedFileExists(): Promise<boolean> {
    if (this.queryFile === undefined) throw new Error('No actual native scope query has completed.');
    try { return (await lstat(this.queryFile)).isFile(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  }

  async filesUnchanged(): Promise<boolean> {
    if (this.baseline === undefined) throw new Error('The pre-query owned-tree baseline is absent.');
    const current = await this.tree();
    return current.size === this.baseline.size && [...this.baseline].every(([name, value]) => current.get(name) === value);
  }

  async compare(): Promise<void> {
    if (this.input === undefined) throw new Error('Arrange the actual loader/live comparison first.');
    await this.seal();
    const { configuration, source } = this.input;
    const checked = new ConfigurationReader([]).read({ sourceId: configuration.file, text: configuration.text! });
    if (checked.value === undefined) throw new Error('The supplied comparison configuration was rejected: ' + JSON.stringify(checked.problems));
    this.captured = await new SourceLoader(configuration.file).load(checked.value, {
      modules: [], packages: checked.value.packages.map(({ alias, phases }) => ({ alias, phases })),
    });
    const analysis = new DocumentAnalysis({ publish: (_source, _version, report) => { this.live = report; }, clear: () => {} }, this.files);
    analysis.configurationChanged(configuration);
    analysis.opened(source, 1);
  }

  requirementsAgree(): boolean {
    if (this.captured === undefined || this.live === undefined) throw new Error('No actual loader/live comparison has completed.');
    return this.captured.value !== undefined && !this.captured.problems.length && !this.captured.syntax.length
      && this.live.compilation?.value !== undefined && this.live.requirements !== undefined
      && this.live.dependencyProblems !== undefined && this.live.dependencyProblems.length === 0
      && JSON.stringify(this.captured.requirements) === JSON.stringify(this.live.requirements);
  }
  capturedAliases(phase: string): string[] {
    if (this.captured === undefined) throw new Error('The actual source-loader result is absent.');
    return this.aliases(this.captured.requirements, phase);
  }
  liveAliases(phase: string): string[] {
    if (this.live === undefined) throw new Error('The actual live report is absent.');
    return this.aliases(this.live.requirements ?? [], phase);
  }
  private aliases(rows: readonly ScopedPackageRequirement[], phase: string): string[] {
    return rows.filter(row => row.phase === phase).map(row => row.alias);
  }

  private async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const outcomes = await Promise.allSettled(this.directories.map(async before => {
      const current = await lstat(before.directory, { bigint: true });
      if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== before.dev || current.ino !== before.ino) {
        throw new Error('Refusing cleanup after owned source-directory identity changed: ' + before.directory);
      }
      await removeOwnedDirectory(before.directory);
    }));
    const failures = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map(outcome => outcome.reason), 'Owned source-fixture cleanup failed.');
  }
}
