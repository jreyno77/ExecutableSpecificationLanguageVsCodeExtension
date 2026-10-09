import { promises as fs } from 'node:fs';
import { dirname, join, relative, resolve, sep, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { onTestFinished } from 'vitest';
import ts from 'typescript';
import { runCli, type Diagnostic } from 'executable-specification-language';
import { GenerationOnSave } from '../../src/core/GenerationOnSave.js';
import type { GenerationBuffer } from '../../src/core/GenerationBuffer.js';
import type { GenerationState } from '../../src/core/GenerationState.js';
import type { GenerationResult } from '../../src/core/GenerationResult.js';
import type { GenerationRequest } from '../../src/core/GenerationRequest.js';
import type { GenerationRunFeedback } from '../../src/core/GenerationRunFeedback.js';
import type { GenerationShutdownFeedback } from '../../src/core/GenerationShutdownFeedback.js';
import type { GenerationWorker } from '../../src/core/GenerationWorker.js';
import type { ConnectionConfiguration } from '../../src/core/ConnectionConfiguration.js';
import { ownTemporaryDirectory, removeOwnedDirectory, within } from './vscode/native-process.js';

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
export type GenerationTree = { path: string; kind: string; bytes?: string }[];

/** Actual saved project setup shared by core and installed-host generation cases. */
export class GenerationProject {
  readonly manifest: string;
  readonly target: string;
  readonly main: string;
  readonly other: string;
  configuration!: ConnectionConfiguration;
  before!: GenerationTree;
  receipt!: GenerationResult;
  private constructor(readonly directory: string) {
    this.manifest = join(directory, 'expec.json'); this.target = join(directory, 'target');
    this.main = join(directory, 'authoring/main.expec'); this.other = join(directory, 'authoring/shelf.expec');
  }
  static async create(source: string, otherEntry: string, outputs = false, parent?: string): Promise<GenerationProject> {
    const project = new GenerationProject(await ownTemporaryDirectory('expec-saved-generation-', parent));
    try {
      await project.write('authoring/main.expec', source);
      await project.write('authoring/shelf.expec', otherEntry);
      await project.write('target/src/existing.ts', 'export {};\n');
      await project.write('target/package.json', '{"type":"module","private":true}');
      await project.write('target/tsconfig.json', JSON.stringify({ compilerOptions: {
        target: 'ES2022', lib: ['ES2022'], module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, types: [], skipLibCheck: true,
      }, include: ['src/**/*.ts'] }));
      const configuration = JSON.stringify({ formatVersion: 1, version: '0.1.0', project: { root: 'target' },
        build: { entries: ['authoring/main.expec', 'authoring/shelf.expec'] }, outputs: [
          { id: 'typescript', options: { directory: 'src', configFile: 'tsconfig.json' } },
          ...outputs ? [{ id: 'markdown', options: { directory: 'docs' } }, { id: 'uml', options: { directory: 'diagrams' } }] : [],
        ] });
      await project.write('expec.json', configuration);
      let stdout = '', stderr = '';
      const code = await runCli(['build', '--config', project.manifest, '--json'], {}, {
        stdout: text => { stdout += text; }, stderr: text => { stderr += text; },
      });
      const report = JSON.parse(stdout) as { status: string; problems: unknown[]; syntax: unknown[]; deferred: unknown[] };
      if (code !== 0 || report.status !== 'built') throw Error('Actual baseline SDK build failed: ' + JSON.stringify({ code, ...report, stderr }));
      project.receipt = { report: stdout, exitCode: code, runtimeVersion: process.versions.node };
      project.configuration = { file: project.manifest, text: await fs.readFile(project.manifest, 'utf8'), writable: true };
      project.before = await project.tree();
      return project;
    } catch (error) {
      try { await project.dispose(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Generation baseline and cleanup failed'); }
      throw error;
    }
  }
  async write(path: string, text: string): Promise<void> {
    const filename = this.path(path); await fs.mkdir(dirname(filename), { recursive: true }); await fs.writeFile(filename, text);
  }
  path(path: string): string {
    const target = resolve(this.directory, path), local = relative(this.directory, target);
    if (isAbsolute(local) || local === '..' || local.startsWith('..' + sep)) throw Error('Generation fixture escaped its owned root');
    return target;
  }
  async tree(): Promise<GenerationTree> {
    const entries: GenerationTree = [];
    const visit = async (local: string): Promise<void> => {
      const info = await fs.lstat(join(this.target, local));
      if (info.isSymbolicLink()) entries.push({ path: local, kind: 'link' });
      else if (info.isDirectory()) {
        entries.push({ path: local, kind: 'directory' });
        for (const child of (await fs.readdir(join(this.target, local))).sort()) await visit(local ? local + '/' + child : child);
      } else if (info.isFile()) entries.push({ path: local, kind: 'file', bytes: (await fs.readFile(join(this.target, local))).toString('base64') });
      else entries.push({ path: local, kind: 'other' });
    };
    await visit(''); return entries;
  }
  async keepImplementation(path: string, body: string): Promise<void> {
    await fs.writeFile(join(this.target, path), await this.implementationText(path, body));
  }
  async implementationText(path: string, body: string): Promise<string> {
    const filename = join(this.target, path), text = await fs.readFile(filename, 'utf8');
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const methods = source.statements.filter(ts.isClassDeclaration).flatMap(item => item.members)
      .filter(ts.isMethodDeclaration).filter(item => item.name.getText(source) === 'count');
    const block = methods[0]?.body;
    if (methods.length !== 1 || !block) throw Error('Expected actual generated Library.count body');
    return text.slice(0, block.getStart(source)) + '{ ' + body + ' }' + text.slice(block.end);
  }
  async fileIncludes(path: string, text: string): Promise<boolean> { return (await fs.readFile(join(this.target, path), 'utf8')).includes(text); }
  dispose(): Promise<void> { return removeOwnedDirectory(this.directory); }
}

/** Same-process owned worker adapts the actual hosted SDK; it does not plan or write itself. */
class SavedSdkWorker implements GenerationWorker {
  starts = 0;
  private controller?: AbortController;
  private operation?: Promise<void>;
  private readonly permissions = new Set<Promise<readonly Diagnostic[]>>();
  private stopped = false;
  private hold?: ReturnType<typeof gate>;
  private reached = gate();
  constructor(private readonly changed: () => void) {}
  get active(): boolean { return this.operation !== undefined; }
  holdPermission(): void { this.hold = gate(); }
  releasePermission(): void { this.hold?.resolve(); }
  async awaitPermission(): Promise<void> {
    await within(Promise.race([this.reached.promise, ...(this.operation ? [this.operation.then(() => { throw Error('Actual SDK run finished without reaching the held permission'); })] : [])]),
      30_000, 'Actual SDK host permission was not reached');
  }
  start(request: GenerationRequest, feedback: GenerationRunFeedback): void {
    if (this.stopped || this.operation) throw Error('Owned SDK worker rejects overlapping or disposed starts');
    this.starts++; this.controller = new AbortController();
    const controller = this.controller;
    const operation = this.execute(request, feedback, controller);
    this.operation = operation; this.changed();
    void operation.then(() => { if (this.operation === operation) this.operation = undefined; this.changed(); }, () => {
      if (this.operation === operation) this.operation = undefined; this.changed();
    });
  }
  private async execute(request: GenerationRequest, feedback: GenerationRunFeedback, controller: AbortController): Promise<void> {
    let report = '', stderr = '', exitCode: number | undefined, error: string | undefined;
    try {
      exitCode = await runCli(['build', '--config', request.configuration.file, '--json'], {}, {
        signal: controller.signal, stdout: text => { report += text; }, stderr: text => { stderr += text; },
        checkWrite: root => {
          const query = (async () => {
            if (this.hold) { this.reached.resolve(); await this.hold.promise; }
            const actual = feedback.writeProblems(root.path);
            return actual.map(problem => ({ code: problem.code, message: problem.message,
              at: { kind: 'dependency', path: ['project', problem.path] }, related: [] } satisfies Diagnostic));
          })();
          this.permissions.add(query);
          void query.then(() => this.permissions.delete(query), () => this.permissions.delete(query));
          return query;
        },
      });
    } catch (cause) { error = String(cause); }
    await Promise.allSettled([...this.permissions]);
    const result: GenerationResult = { report, runtimeVersion: process.versions.node,
      ...(exitCode === undefined ? {} : { exitCode }), ...(error || stderr ? { error: [error, stderr].filter(Boolean).join('\n') } : {}) };
    feedback.finished(result);
  }
  cancel(): void { this.controller?.abort(); }
  dispose(completion: GenerationShutdownFeedback): void {
    this.stopped = true; this.cancel(); this.releasePermission();
    void this.drain().then(() => completion.stopped(undefined), cause => completion.stopped(String(cause)));
  }
  async drain(): Promise<void> { await this.operation; }
}

/** Fresh editor facts and real feedback/target bytes around GenerationOnSave. */
export class GenerationOnSaveRecording {
  readonly states: GenerationState[] = [];
  readonly results: { configurationFile: string; result: GenerationResult }[] = [];
  private readonly buffers = new Map<string, GenerationBuffer>();
  private readonly listeners = new Set<() => void>();
  private readonly worker = new SavedSdkWorker(() => this.notify());
  private core?: GenerationOnSave;
  private enabled = false;
  private lastIntent?: { uri: string; version: number; publication: number };
  private constructor(readonly project: GenerationProject) {}
  static async create(source: string, otherEntry: string, enabled: boolean, held = false): Promise<GenerationOnSaveRecording> {
    const recording = new GenerationOnSaveRecording(await GenerationProject.create(source, otherEntry));
    onTestFinished(() => recording.dispose());
    recording.buffer(recording.project.main, source);
    recording.buffer(recording.project.other, otherEntry);
    recording.buffer(recording.project.manifest, recording.project.configuration.text!);
    recording.core = new GenerationOnSave(recording.worker,
      { buffers: () => [...recording.buffers.values()].map(value => ({ ...value })) }, {
        present: state => { recording.states.push(structuredClone(state)); recording.notify(); },
        record: (configurationFile, result) => { recording.results.push({ configurationFile, result: structuredClone(result) }); recording.notify(); },
      });
    if (held) recording.worker.holdPermission();
    recording.enabled = enabled;
    recording.core.configurationChanged(recording.project.configuration, enabled);
    return recording;
  }
  private buffer(path: string, text: string): GenerationBuffer {
    const uri = pathToFileURL(path).href, previous = this.buffers.get(uri);
    const current = { uri, text, version: previous?.version ?? 1, dirty: false };
    this.buffers.set(uri, current); return current;
  }
  private notify(): void { for (const listener of this.listeners) listener(); }
  private current(path: string): GenerationBuffer {
    const value = this.buffers.get(pathToFileURL(path).href); if (!value) throw Error('No actual arranged editor buffer'); return value;
  }
  async edit(text: string): Promise<void> {
    const current = this.current(this.project.main);
    this.buffers.set(current.uri, { ...current, text, version: current.version + 1, dirty: true });
    this.core!.editorChanged();
  }
  async save(): Promise<void> { await this.savePath(this.project.main); }
  async saveOther(text: string): Promise<void> {
    const current = this.current(this.project.other);
    this.buffers.set(current.uri, { ...current, text, version: current.version + 1, dirty: false });
    await this.savePath(this.project.other);
  }
  private async savePath(path: string): Promise<void> {
    const current = this.current(path); await fs.writeFile(path, current.text);
    this.buffers.set(current.uri, { ...current, dirty: false });
    this.request(current.text, current.version, current.uri);
  }
  request(text: string, version: number, uri = pathToFileURL(this.project.main).href): void {
    this.lastIntent = { uri, version, publication: this.states.length };
    this.core!.sourceSaved({ uri, text }, version);
  }
  setEnabled(enabled: boolean): void { this.enabled = enabled; this.core!.configurationChanged(this.project.configuration, enabled); }
  dirtyOther(text: string): void {
    const current = this.current(this.project.other);
    this.buffers.set(current.uri, { ...current, text, version: current.version + 1, dirty: true });
    this.core!.editorChanged();
  }
  async replaceSavedConfiguration(text: string): Promise<void> { await fs.writeFile(this.project.manifest, text); }
  async saveUnrelated(text: string): Promise<void> {
    const path = this.project.path('authoring/unrelated.expec'); await fs.writeFile(path, text);
    const current = this.buffer(path, text); this.request(text, current.version, current.uri);
  }
  async dirtyTarget(path: string, text: string): Promise<void> {
    const filename = join(this.project.target, path), saved = await fs.readFile(filename, 'utf8');
    const current = this.buffer(filename, saved);
    this.buffers.set(current.uri, { ...current, text, version: current.version + 1, dirty: true });
    this.core!.editorChanged();
  }
  keepImplementation(path: string, body: string): Promise<void> { return this.project.keepImplementation(path, body); }
  async awaitPermission(): Promise<void> {
    await this.until(() => this.worker.active || this.status() === 'blocked', 'The actual save did not start or refuse');
    if (!this.worker.active) throw Error('The actual save was refused before the arranged host permission');
    await this.worker.awaitPermission();
  }
  releasePermission(): void { this.worker.releasePermission(); }
  async settle(): Promise<void> {
    await this.until(() => {
      const last = this.states.at(-1), intent = this.lastIntent;
      return !this.worker.active && !!last && !['generating', 'queued'].includes(last.status)
        && (!intent || this.states.length > intent.publication && last.sourceUri === intent.uri && last.sourceVersion === intent.version);
    }, 'The current save did not publish a terminal state and settle its actual worker');
  }
  private until(condition: () => boolean, explanation: string): Promise<void> {
    return within(new Promise<void>(resolveCondition => {
      const check = () => { if (condition()) { this.listeners.delete(check); resolveCondition(); } };
      this.listeners.add(check); check();
    }), 30_000, explanation);
  }
  status(): string { return this.states.at(-1)?.status ?? ''; }
  explanation(): string { return this.states.at(-1)?.message ?? ''; }
  starts(): number { return this.worker.starts; }
  async unchanged(): Promise<boolean> { return JSON.stringify(await this.project.tree()) === JSON.stringify(this.project.before); }
  async fileIncludes(path: string, text: string): Promise<boolean> { return this.project.fileIncludes(path, text); }
  dirtyTextIncludes(text: string): boolean { return [...this.buffers.values()].some(value => value.dirty && value.text.includes(text)); }
  private async dispose(): Promise<void> {
    const errors: unknown[] = [];
    try { this.core?.dispose(); } catch (error) { errors.push(error); }
    this.worker.cancel(); this.worker.releasePermission();
    try { await this.worker.drain(); } catch (error) { errors.push(error); }
    try { await this.project.dispose(); } catch (error) { errors.push(error); }
    this.listeners.clear();
    if (errors.length) throw new AggregateError(errors, 'Owned saved-generation cleanup failed');
  }
}