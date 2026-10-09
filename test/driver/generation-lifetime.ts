import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { onTestFinished } from 'vitest';
import { GenerationOnSave } from '../../src/core/GenerationOnSave.js';
import type { GenerationBuffer } from '../../src/core/GenerationBuffer.js';
import type { GenerationState } from '../../src/core/GenerationState.js';
import type { GenerationResult } from '../../src/core/GenerationResult.js';
import type { GenerationRequest } from '../../src/core/GenerationRequest.js';
import type { GenerationRunFeedback } from '../../src/core/GenerationRunFeedback.js';
import { GenerationProject } from './generation-on-save.js';
import { ownTemporaryDirectory, removeOwnedDirectory, within } from './vscode/native-process.js';

/** Controlled worker port isolates scheduling. It never claims to generate files. */
export class GenerationLifetime {
  readonly starts: { request: GenerationRequest; feedback: GenerationRunFeedback; finished: boolean }[] = [];
  readonly states: GenerationState[] = [];
  readonly records: { file: string; result: GenerationResult }[] = [];
  cancellations = 0;
  private readonly listeners = new Set<() => void>();
  private readonly buffers = new Map<string, GenerationBuffer>();
  readonly core: GenerationOnSave;
  private constructor(readonly directory: string, readonly file: string, readonly manifest: string,
    text: string, configuration: string, private readonly project?: GenerationProject) {
    this.buffers.set(pathToFileURL(file).href, { uri: pathToFileURL(file).href, version: 1, text, dirty: false });
    this.buffers.set(pathToFileURL(manifest).href, { uri: pathToFileURL(manifest).href, version: 1, text: configuration, dirty: false });
    this.core = new GenerationOnSave({
      start: (request, feedback) => { this.starts.push({ request, feedback, finished: false }); this.notify(); },
      cancel: () => { this.cancellations++; this.notify(); },
      dispose: completion => { this.finishOutstanding(); completion.stopped(undefined); },
    }, { buffers: () => [...this.buffers.values()].map(value => ({ ...value })) }, {
      present: state => { this.states.push({ ...state }); this.notify(); },
      record: (file, result) => { this.records.push({ file, result: { ...result } }); this.notify(); },
    });
    this.core.configurationChanged({ file: manifest, text: configuration, writable: true }, true);
    onTestFinished(() => this.dispose());
  }
  static async create(): Promise<GenerationLifetime> {
    const directory = await ownTemporaryDirectory('expec-generation-lifetime-');
    try {
      const file = join(directory, 'main.expec'), manifest = join(directory, 'expec.json');
      const text = 'type Book { title: Text }';
      await fs.mkdir(join(directory, 'target'));
      const configuration = JSON.stringify({ formatVersion: 1, version: '0.1.0', project: { root: 'target' }, build: { entries: ['main.expec'] }, outputs: [] });
      await fs.writeFile(file, text); await fs.writeFile(manifest, configuration);
      return new GenerationLifetime(directory, file, manifest, text, configuration);
    } catch (error) { await removeOwnedDirectory(directory); throw error; }
  }
  static async withActualReceipt(): Promise<GenerationLifetime> {
    const project = await GenerationProject.create('type Book { title: Text }', 'type Shelf { copies: Number }');
    try { return new GenerationLifetime(project.directory, project.main, project.manifest, await fs.readFile(project.main, 'utf8'), project.configuration.text!, project); }
    catch (error) { await project.dispose(); throw error; }
  }
  actualReceipt(): GenerationResult { if (!this.project) throw new Error('No actual SDK receipt was acquired'); return { ...this.project.receipt }; }
  async save(text: string, version: number): Promise<void> {
    await fs.writeFile(this.file, text);
    const uri = pathToFileURL(this.file).href;
    this.buffers.set(uri, { uri, version, text, dirty: false });
    this.core.sourceSaved({ uri, text }, version);
  }
  finish(index: number, result: GenerationResult = { report: '', error: 'Owned scheduling port refused the request.' }): void {
    const start = this.starts[index]; if (!start || start.finished) throw new Error('No pending actual coordinator request');
    start.finished = true; start.feedback.finished(result); this.notify();
  }
  waitFor(condition: () => boolean, phase = 'coordinator callback'): Promise<void> {
    let check!: () => void;
    return within(new Promise<void>(done => {
      check = () => { if (condition()) { this.listeners.delete(check); done(); } };
      this.listeners.add(check); check();
    }), 2_000, 'The actual ' + phase + ' did not arrive').catch(error => { throw new Error(String(error) + ' ' + JSON.stringify({ starts: this.starts.map(start => ({ version: start.request.version, finished: start.finished })), cancellations: this.cancellations, states: this.states.slice(-3) })); }).finally(() => this.listeners.delete(check));
  }
  private notify(): void { for (const listener of [...this.listeners]) listener(); }
  private finishOutstanding(): void { for (const [index, start] of this.starts.entries()) if (!start.finished) this.finish(index); }
  private async dispose(): Promise<void> {
    this.core.dispose(); this.finishOutstanding(); this.listeners.clear();
    if (this.project) await this.project.dispose(); else await removeOwnedDirectory(this.directory);
  }
}
