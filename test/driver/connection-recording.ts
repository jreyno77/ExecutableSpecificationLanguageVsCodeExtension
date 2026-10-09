import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ownTemporaryDirectory, removeOwnedDirectory } from './vscode/native-process.js';
import { onTestFinished } from 'vitest';
import { ConnectionController } from '../../src/core/ConnectionController.js';
import type { ConnectionConfiguration } from '../../src/core/ConnectionConfiguration.js';
import type { ConnectionState } from '../../src/core/ConnectionState.js';

type SaveRequest = { previous: ConnectionConfiguration; text: string };

/** Exercises the real core with owned files and records its actual feedback. */
export class ConnectionRecording {
  readonly saves: SaveRequest[] = [];
  readonly states: ConnectionState[] = [];
  readonly file: string;
  private readonly controller: ConnectionController;
  private readonly observations = new Set<() => void>();

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
    if (!actual.writable || !request.previous.writable || actual.text !== request.previous.text) {
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
