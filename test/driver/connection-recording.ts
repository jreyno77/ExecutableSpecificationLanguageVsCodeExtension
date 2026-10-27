import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ownTemporaryDirectory, removeOwnedDirectory } from './vscode/native-process.js';
import { onTestFinished } from 'vitest';
import { ConnectionController } from '../../src/core/ConnectionController.js';
import type { ConnectionConfiguration } from '../../src/core/ConnectionConfiguration.js';
import type { ConnectionState } from '../../src/core/ConnectionState.js';
import type { ConnectionOutputChoice } from '../../src/core/ConnectionOutputChoice.js';
import type { ConnectionGuidance } from '../../src/core/ConnectionGuidance.js';
import type { ConnectionOutputGuidance } from '../../src/core/ConnectionOutputGuidance.js';

type SaveRequest = { previous: ConnectionConfiguration; text: string };
type GuidanceQuery = {
  value: ConnectionGuidance | undefined;
  saved: ConnectionConfiguration;
  publications: number;
  saves: number;
};

function canonical(value: unknown): string {
  const ordered = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(ordered);
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, field]) => [key, ordered(field)]));
    }
    return item;
  };
  return JSON.stringify(ordered(value));
}

/** Exercises the real core with owned files and records its actual feedback. */
export class ConnectionRecording {
  readonly saves: SaveRequest[] = [];
  readonly states: ConnectionState[] = [];
  readonly file: string;
  readonly work: Array<ConnectionConfiguration | undefined> = [];
  private readonly controller: ConnectionController;
  private readonly observations = new Set<() => void>();
  private readonly queries: GuidanceQuery[] = [];
  private baseline = new Map<string, string>();

  private constructor(readonly directory: string, private readonly writable: boolean) {
    this.file = join(directory, 'expec.json');
    this.controller = new ConnectionController({
      present: state => { this.states.push(state); this.observed(); },
      saveConfiguration: (previous, text) => {
        this.saves.push({ previous, text });
        this.observed();
      },
    });
  }

  static async open(text: string | undefined, writable: boolean): Promise<ConnectionRecording> {
    const directory = await ownTemporaryDirectory('expec-connection-');
    let recording: ConnectionRecording | undefined;
    onTestFinished(async () => {
      try { recording?.controller.dispose(); }
      finally { await removeOwnedDirectory(directory); }
    });
    await Promise.all([mkdir(join(directory, 'alpha')), mkdir(join(directory, 'beta'))]);
    if (text !== undefined) await writeFile(join(directory, 'expec.json'), text, 'utf8');
    recording = new ConnectionRecording(directory, writable);
    recording.baseline = await recording.tree();
    return recording;
  }

  get latest(): ConnectionState {
    const state = this.states.at(-1);
    if (!state) throw new Error('The connection has not published a state.');
    return state;
  }

  async inspect(): Promise<void> {
    this.controller.configurationChanged(await this.snapshot());
    await this.settled();
  }

  async choose(name: string): Promise<void> {
    const requests = this.saves.length;
    this.controller.chooseProject(this.fixtureDirectory(name));
    await this.waitFor(() => this.saves.length > requests || this.terminal());
  }

  async confirmSave(): Promise<void> {
    const request = this.request();
    const actual = await this.snapshot();
    if (request.previous.file !== this.file || !actual.writable || !request.previous.writable || actual.text !== request.previous.text) {
      this.controller.saveFailed(request.previous, 'Configuration changed before save.');
    } else {
      await writeFile(this.file, request.text, 'utf8');
      this.controller.configurationChanged(await this.snapshot());
    }
    await this.settled();
  }

  async rejectSave(message: string): Promise<void> {
    this.controller.saveFailed(this.request().previous, message);
    await this.settled();
  }

  async remove(name: string): Promise<void> {
    const directory = this.fixtureDirectory(name);
    await rm(directory, { recursive: true, force: true });
    this.controller.targetChanged(directory);
    await this.settled();
  }

  async restore(name: string): Promise<void> {
    const directory = this.fixtureDirectory(name);
    await mkdir(directory, { recursive: true });
    this.controller.targetChanged(directory);
    await this.settled();
  }

  async replace(text: string): Promise<void> {
    await writeFile(this.file, text, 'utf8');
    this.controller.configurationChanged(await this.snapshot());
    await this.settled();
  }

  attachWork(): void {
    this.controller.observeWork({ configurationChanged: configuration => { this.work.push(configuration); } });
  }

  async create(name: string, outputs: ConnectionOutputChoice[], entries: string[]): Promise<void> {
    const requests = this.saves.length;
    this.controller.createConnection(this.fixtureDirectory(name), outputs, entries);
    await this.waitFor(() => this.saves.length > requests || this.terminal());
  }

  async disconnect(): Promise<void> {
    this.controller.disconnect();
    await this.settled();
  }

  async reconnect(): Promise<void> {
    this.controller.reconnect();
    await this.settled();
  }

  async deleteConnection(): Promise<void> {
    const requests = this.saves.length;
    this.controller.deleteConnection();
    await this.waitFor(() => this.saves.length > requests || this.terminal());
  }

  async keepSource(path: string, text: string): Promise<void> {
    await this.keepFile(this.ownedPath(this.directory, path), text);
  }

  async keepTarget(name: string, path: string, text: string): Promise<void> {
    await this.keepFile(this.ownedPath(this.fixtureDirectory(name), path), text);
  }

  workProjectName(): string {
    const snapshot = this.work.at(-1);
    if (snapshot?.text === undefined) return '';
    const value = JSON.parse(snapshot.text) as { project?: { root: string } };
    return value.project ? basename(resolve(dirname(snapshot.file), value.project.root)) : '';
  }

  async savedText(): Promise<string> {
    return (await this.snapshot()).text ?? '';
  }

  async savedEntries(): Promise<string[]> {
    return (await this.savedMetadata()).build.entries;
  }

  async savedOutputIds(): Promise<string[]> {
    return (await this.savedMetadata()).outputs.map(output => output.id);
  }

  async savedOutputOptions(id: string): Promise<string> {
    const output = (await this.savedMetadata()).outputs.find(output => output.id === id);
    if (!output) throw new Error('No actual saved output ' + id + '.');
    return canonical(output.options);
  }

  async savedProjectSettings(): Promise<string> {
    const saved = await this.snapshot();
    if (saved.text === undefined) throw new Error('The saved connection metadata is absent.');
    const project: unknown = JSON.parse(saved.text).project;
    if (!project || typeof project !== 'object' || Array.isArray(project)) {
      throw new Error('The saved connection has no project metadata.');
    }
    const { root, ...settings } = project as Record<string, unknown>;
    return canonical(settings);
  }
  async savedVersion(): Promise<string> {
    return (await this.savedMetadata()).version;
  }

  async savedPackages(): Promise<string> {
    return canonical((await this.savedMetadata()).packages ?? []);
  }

  async treesUnchanged(): Promise<boolean> {
    const actual = await this.tree();
    return actual.size === this.baseline.size && [...this.baseline]
      .every(([path, bytes]) => actual.get(path) === bytes);
  }

  async inspectGuidance(): Promise<void> {
    const saved = await this.snapshot();
    const publications = this.states.length, saves = this.saves.length;
    const value = this.controller.guidance();
    this.queries.push({ value, saved, publications: this.states.length - publications, saves: this.saves.length - saves });
  }

  disposeController(): void { this.controller.dispose(); }
  guidanceAvailable(query: number): boolean { return this.query(query).value !== undefined; }
  guidanceRequiresEntries(query: number): boolean { return this.guidance(query).requiresEntries; }
  guidanceHasProject(query: number): boolean { return this.guidance(query).hasProject; }
  guidanceOutputs(query: number): ConnectionOutputGuidance[] { return this.guidance(query).outputs; }
  guidancePublications(query: number): number { return this.query(query).publications; }
  guidanceSaves(query: number): number { return this.query(query).saves; }
  guidanceMatchesSavedSnapshot(query: number): boolean {
    const { value, saved } = this.query(query);
    return value !== undefined && value.configuration.file === saved.file
      && value.configuration.text === saved.text && value.configuration.writable === saved.writable;
  }

  private query(index: number): GuidanceQuery {
    if (!Number.isSafeInteger(index) || index < 1) throw new RangeError('Use a positive recorded guidance query.');
    const query = this.queries[index - 1];
    if (!query) throw new Error('No actual guidance query ' + index + '.');
    return query;
  }

  private guidance(index: number): ConnectionGuidance {
    const value = this.query(index).value;
    if (!value) throw new Error('Guidance was absent for query ' + index + '.');
    return value;
  }

  private async savedMetadata(): Promise<{
    version: string; build: { entries: string[] }; outputs: Array<{ id: string; options: unknown }>; packages?: unknown;
  }> {
    const text = (await this.snapshot()).text;
    if (text === undefined) throw new Error('The owned manifest does not exist.');
    return JSON.parse(text);
  }

  private ownedPath(root: string, path: string): string {
    const file = resolve(root, path), route = relative(root, file);
    if (!path || isAbsolute(path) || !route || route === '..' || route.startsWith('..' + sep)
      || isAbsolute(route) || file === this.file) throw new Error('Use an owned fixture file path.');
    return file;
  }

  private async keepFile(file: string, text: string): Promise<void> {
    if (this.states.length || this.saves.length) throw new Error('Create fixture files before inspecting the connection.');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text, 'utf8');
    this.baseline.set(relative(this.directory, file), 'file:' + (await readFile(file)).toString('hex'));
    for (let folder = dirname(file); folder !== this.directory; folder = dirname(folder)) {
      this.baseline.set(relative(this.directory, folder), 'directory');
    }
  }

  private async tree(): Promise<Map<string, string>> {
    const entries = new Map<string, string>();
    const visit = async (directory: string): Promise<void> => {
      for (const name of await readdir(directory)) {
        const file = join(directory, name);
        if (file === this.file) continue;
        const stat = await lstat(file), path = relative(this.directory, file);
        if (stat.isDirectory()) { entries.set(path, 'directory'); await visit(file); }
        else if (stat.isFile()) entries.set(path, 'file:' + (await readFile(file)).toString('hex'));
        else throw new Error('Unsupported owned fixture entry ' + file + '.');
      }
    };
    await visit(this.directory);
    return entries;
  }

  private fixtureDirectory(name: string): string {
    if (!['alpha', 'beta', 'missing'].includes(name)) throw new Error('Unknown owned project fixture: ' + name);
    return join(this.directory, name);
  }

  private request(): SaveRequest {
    const request = this.saves.at(-1);
    if (!request) throw new Error('No configuration save was requested.');
    return request;
  }

  private async snapshot(): Promise<ConnectionConfiguration> {
    let text: string | undefined;
    try { text = await readFile(this.file, 'utf8'); }
    catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    return Object.freeze({ file: this.file, text, writable: this.writable });
  }

  private terminal(): boolean {
    const state = this.states.at(-1);
    return state !== undefined && state.status !== 'checking';
  }

  private settled(): Promise<void> { return this.waitFor(() => this.terminal()); }
  private observed(): void { for (const observation of [...this.observations]) observation(); }

  private waitFor(ready: () => boolean): Promise<void> {
    if (ready()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const observe = () => {
        if (!ready()) return;
        clearTimeout(timeout);
        this.observations.delete(observe);
        resolve();
      };
      const timeout = setTimeout(() => {
        this.observations.delete(observe);
        reject(new Error('The connection did not publish a terminal state or save request within five seconds.'));
      }, 5_000);
      this.observations.add(observe);
      observe();
    });
  }
}
