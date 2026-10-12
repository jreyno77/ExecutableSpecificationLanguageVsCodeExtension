import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { ConfigurationReader, ProjectConnector } from 'executable-specification-language';
import { ConnectionController } from '../../../src/core/ConnectionController.js';
import type { ConnectionConfiguration } from '../../../src/core/ConnectionConfiguration.js';
import type { ConnectionState } from '../../../src/core/ConnectionState.js';
import { ownTemporaryDirectory, removeOwnedDirectory } from '../../driver/vscode/native-process.js';

type SaveRequest = { previous: ConnectionConfiguration; text: string };
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}
function recordedConnection(present?: (state: ConnectionState) => void, save?: (request: SaveRequest) => void) {
  const states: ConnectionState[] = [], saves: SaveRequest[] = [];
  const controller = new ConnectionController({
    present: state => { states.push(state); present?.(state); },
    saveConfiguration: (previous, text) => { const request = { previous, text }; saves.push(request); save?.(request); },
  });
  onTestFinished(() => controller.dispose());
  return { controller, states, saves };
}
async function projectDirectories() {
  const directory = await ownTemporaryDirectory('expec-connection-unit-');
  onTestFinished(() => removeOwnedDirectory(directory));
  const alpha = join(directory, 'alpha'), beta = join(directory, 'beta');
  await Promise.all([mkdir(alpha), mkdir(beta)]);
  return { file: join(directory, 'expec.json'), alpha, beta };
}
function configuredText(root: string): string {
  return JSON.stringify({ formatVersion: 1, version: '0.1.0', build: { entries: ['src/main.expec'] }, outputs: [], project: { root } });
}
function heldConnector() {
  const entered = deferred<void>(), release = deferred<void>();
  const connect = ProjectConnector.prototype.connect;
  const spy = vi.spyOn(ProjectConnector.prototype, 'connect').mockImplementationOnce(async function (this: ProjectConnector, configuration) {
    const result = await connect.call(this, configuration);
    entered.resolve();
    await release.promise;
    return result;
  });
  onTestFinished(() => { release.resolve(); spy.mockRestore(); });
  return { entered: entered.promise, release: () => release.resolve(), result: () => spy.mock.results[0]!.value };
}

describe('connection currentness at real verification and feedback boundaries', () => {
  it('does not let older directory verification replace a newer invalid configuration', async () => {
    const { file, alpha } = await projectDirectories();
    const held = heldConnector();
    const { controller, states, saves } = recordedConnection();
    controller.configurationChanged({ file, text: configuredText(alpha), writable: true });
    await held.entered;
    controller.configurationChanged({ file, text: '{"project":', writable: true });
    held.release();
    await held.result();
    expect(states.map(state => state.status)).toEqual(['checking', 'invalid']);
    expect(states.at(-1)?.verifiedDirectory).toBeUndefined();
    expect(saves).toEqual([]);
  });

  it('honors a new configuration supplied reentrantly while presenting checking', async () => {
    const { file, alpha, beta } = await projectDirectories();
    const connected = deferred<void>();
    let controller: ConnectionController;
    const recorded = recordedConnection(state => {
      if (state.status === 'checking' && state.target === alpha) {
        controller.configurationChanged({ file, text: configuredText(beta), writable: true });
      }
      if (state.status === 'connected') connected.resolve();
    });
    controller = recorded.controller;
    controller.configurationChanged({ file, text: configuredText(alpha), writable: true });
    await connected.promise;
    expect(recorded.states.map(state => [state.status, state.target])).toEqual([
      ['checking', alpha], ['checking', beta], ['connected', beta],
    ]);
    expect(recorded.saves).toEqual([]);
  });

  it('captures input and feedback snapshots without retaining caller mutation', async () => {
    const { file, alpha, beta } = await projectDirectories();
    const connected = deferred<void>(), saved = deferred<SaveRequest>();
    const { controller, states } = recordedConnection(state => {
      if (state.status === 'connected') connected.resolve();
    }, request => saved.resolve(request));
    const text = configuredText(alpha);
    const snapshot = { file, text, writable: true };
    controller.configurationChanged(snapshot);
    snapshot.file = join(beta, 'another.json');
    snapshot.text = '{';
    snapshot.writable = false;
    await connected.promise;
    const first = states.at(-1)!;
    controller.chooseProject(beta);
    const request = await saved.promise;
    expect(first).toMatchObject({ configurationFile: file, status: 'connected', target: alpha });
    expect(Object.isFrozen(first)).toBe(true);
    expect(request.previous).toEqual({ file, text, writable: true });
    expect(Object.isFrozen(request.previous)).toBe(true);
    expect(first.status).toBe('connected');
  });

  it('matches a save failure to its exact request even when both choices use the same saved bytes', async () => {
    const { file, alpha, beta } = await projectDirectories();
    const firstSave = deferred<SaveRequest>(), secondSave = deferred<SaveRequest>();
    const { controller, states, saves } = recordedConnection(undefined, request => {
      if (saves.length === 1) firstSave.resolve(request);
      else secondSave.resolve(request);
    });
    controller.configurationChanged({ file, writable: true });
    controller.chooseProject(alpha);
    const first = await firstSave.promise;
    controller.chooseProject(beta);
    const second = await secondSave.promise;
    const publications = states.length;
    controller.saveFailed(first.previous, 'Old write failed.');
    expect(states).toHaveLength(publications);
    expect(states.at(-1)?.target).toBe(beta);
    expect(first.previous).not.toBe(second.previous);
    controller.saveFailed(second.previous, 'Current write failed.');
    expect(states.at(-1)).toMatchObject({ status: 'unavailable', target: beta, message: 'Current write failed.' });
    expect(states.at(-1)?.verifiedDirectory).toBeUndefined();
  });

  it('withdraws an older unsent save when another project is chosen', async () => {
    const { file, alpha, beta } = await projectDirectories();
    const held = heldConnector();
    const saved = deferred<SaveRequest>();
    const { controller, saves } = recordedConnection(undefined, request => saved.resolve(request));
    controller.configurationChanged({ file, writable: true });
    controller.chooseProject(alpha);
    await held.entered;
    controller.chooseProject(beta);
    const request = await saved.promise;
    held.release();
    await held.result();
    expect(saves).toEqual([request]);
    expect(JSON.parse(request.text).project.root).toBe(beta);
  });

  it('ends pending verification without publishing or saving after disposal', async () => {
    const { file, alpha } = await projectDirectories();
    const held = heldConnector();
    const { controller, states, saves } = recordedConnection();
    controller.configurationChanged({ file, text: configuredText(alpha), writable: true });
    await held.entered;
    controller.dispose();
    controller.dispose();
    held.release();
    await held.result();
    controller.chooseProject(alpha);
    controller.configurationChanged({ file, writable: true });
    controller.targetChanged(alpha);
    expect(states.map(state => state.status)).toEqual(['checking']);
    expect(saves).toEqual([]);
  });
});

describe('connection management for saved metadata and active work', () => {
  it('returns immutable guidance from captured metadata without repeated SDK work or effects', async () => {
    const { file, alpha } = await projectDirectories();
    const ready = deferred<void>(), work: Array<ConnectionConfiguration | undefined> = [];
    const { controller, states, saves } = recordedConnection(state => {
      if (state.status === 'connected') ready.resolve();
    });
    const text = configuredText(alpha);
    controller.configurationChanged({ file, text, writable: false });
    await ready.promise;
    controller.observeWork({ configurationChanged: configuration => work.push(configuration) });
    const reader = vi.spyOn(ConfigurationReader.prototype, 'read');
    const connector = vi.spyOn(ProjectConnector.prototype, 'connect');
    onTestFinished(() => { reader.mockRestore(); connector.mockRestore(); });
    const publications = states.length, notifications = work.length;
    const first = controller.guidance()!;
    expect(first).toEqual({
      configuration: { file, text, writable: false }, requiresEntries: false, hasProject: true,
      outputs: [
        { id: 'typescript', configured: false, suggestedDirectory: '.' },
        { id: 'uml', configured: false, suggestedDirectory: 'diagrams' },
        { id: 'markdown', configured: false, suggestedDirectory: 'docs' },
      ],
    });
    expect(() => { first.configuration.text = '{'; }).toThrow(TypeError);
    expect(() => { first.outputs[0]!.id = 'java'; }).toThrow(TypeError);
    expect(() => { first.outputs.push({ id: 'java', configured: true }); }).toThrow(TypeError);
    expect(controller.guidance()).toEqual(first);
    expect(first.configuration.text).toBe(text);
    expect(first.outputs[0]?.id).toBe('typescript');
    expect(reader).not.toHaveBeenCalled();
    expect(connector).not.toHaveBeenCalled();
    expect(states).toHaveLength(publications);
    expect(work).toHaveLength(notifications);
    expect(saves).toEqual([]);
  });

  it('only resumes a suspended session for the exact current create confirmation', async () => {
    const { file, alpha, beta } = await projectDirectories();
    const initial = deferred<void>(), resumed = deferred<void>();
    const first = deferred<SaveRequest>(), second = deferred<SaveRequest>();
    const work: Array<ConnectionConfiguration | undefined> = [];
    const recorded = recordedConnection(state => {
      if (state.status === 'connected' && state.target === alpha) initial.resolve();
      if (state.status === 'connected' && state.target === beta) resumed.resolve();
    }, request => { if (recorded.saves.length === 1) first.resolve(request); else second.resolve(request); });
    const { controller, states } = recorded;
    controller.configurationChanged({ file, text: configuredText(alpha), writable: true });
    await initial.promise;
    controller.observeWork({ configurationChanged: configuration => work.push(configuration) });
    controller.disconnect();
    controller.createConnection(beta, [{ id: 'typescript', directory: '.' }], []);
    const proposed = await first.promise;
    const edited = JSON.parse(proposed.text); edited.version = '1.1.0';
    const otherSavedText = JSON.stringify(edited);
    controller.configurationChanged({ file, text: otherSavedText, writable: true });
    expect(states.at(-1)).toMatchObject({ status: 'disconnected', target: beta });
    expect(work.at(-1)).toBeUndefined();
    controller.createConnection(beta, [{ id: 'typescript' }], []);
    const confirmed = await second.promise;
    controller.configurationChanged({ file, text: confirmed.text, writable: true });
    await resumed.promise;
    expect(states.at(-1)).toMatchObject({ status: 'connected', target: beta });
    expect(work.at(-1)).toEqual({ file, text: confirmed.text, writable: true });
  });

  it('keeps established work for the same real directory recheck but withdraws on replacement, loss and selection change', async () => {
    const { file, alpha, beta } = await projectDirectories();
    const initial = deferred<void>(), rechecked = deferred<void>(), replaced = deferred<void>();
    const unavailable = deferred<void>(), selected = deferred<void>();
    let alphaConnections = 0;
    const { controller } = recordedConnection(state => {
      if (state.status === 'connected' && state.target === alpha) {
        alphaConnections++;
        if (alphaConnections === 1) initial.resolve();
        if (alphaConnections === 2) rechecked.resolve();
        if (alphaConnections === 3) replaced.resolve();
      }
      if (state.status === 'unavailable') unavailable.resolve();
      if (state.status === 'connected' && state.target === beta) selected.resolve();
    });
    const work: Array<ConnectionConfiguration | undefined> = [];
    controller.configurationChanged({ file, text: configuredText(alpha), writable: true });
    await initial.promise;
    controller.observeWork({ configurationChanged: configuration => work.push(configuration) });
    const original = work.at(-1)!;
    const held = heldConnector();
    controller.targetChanged(alpha);
    await held.entered;
    expect(work).toEqual([original]);
    held.release();
    await rechecked.promise;
    expect(work).toEqual([original]);
    await rename(alpha, alpha + '-retired');
    await mkdir(alpha);
    controller.targetChanged(alpha);
    await replaced.promise;
    expect(work).toEqual([original, undefined, original]);
    await rm(alpha, { recursive: true });
    controller.targetChanged(alpha);
    await unavailable.promise;
    expect(work.at(-1)).toBeUndefined();
    controller.configurationChanged({ file, text: configuredText(beta), writable: true });
    await selected.promise;
    expect(work.at(-1)?.text).toBe(configuredText(beta));
  });

  it('does not activate work for an initially unverified saved target', async () => {
    const { file, alpha } = await projectDirectories();
    const held = heldConnector(), ready = deferred<void>();
    const { controller } = recordedConnection(state => { if (state.status === 'connected') ready.resolve(); });
    const work: Array<ConnectionConfiguration | undefined> = [];
    controller.configurationChanged({ file, text: configuredText(alpha), writable: true });
    controller.observeWork({ configurationChanged: configuration => work.push(configuration) });
    await held.entered;
    expect(work).toEqual([undefined]);
    held.release();
    await ready.promise;
    expect(work.at(-1)).toEqual({ file, text: configuredText(alpha), writable: true });
  });

  it('keeps a newer reentrant configuration when withdrawing older work', async () => {
    const { file, alpha, beta } = await projectDirectories();
    const initial = deferred<void>(), newer = deferred<void>();
    const { controller, states } = recordedConnection(state => {
      if (state.status === 'connected' && state.target === alpha) initial.resolve();
      if (state.status === 'connected' && state.target === beta) newer.resolve();
    });
    const work: Array<ConnectionConfiguration | undefined> = [];
    controller.configurationChanged({ file, text: configuredText(alpha), writable: true });
    await initial.promise;
    let replace = false;
    controller.observeWork({ configurationChanged: configuration => {
      work.push(configuration);
      if (!configuration && replace) {
        replace = false;
        controller.configurationChanged({ file, text: configuredText(beta), writable: true });
      }
    } });
    replace = true;
    controller.configurationChanged({ file, text: '{"project":', writable: true });
    await newer.promise;
    expect(states.at(-1)).toMatchObject({ status: 'connected', target: beta });
    expect(states.some(state => state.status === 'invalid')).toBe(false);
    expect(controller.guidance()?.configuration.text).toBe(configuredText(beta));
    expect(work.at(-1)?.text).toBe(configuredText(beta));
  });

  it('does not replace a newer observer attached reentrantly during withdrawal', async () => {
    const { file, alpha } = await projectDirectories();
    const ready = deferred<void>();
    const { controller } = recordedConnection(state => { if (state.status === 'connected') ready.resolve(); });
    controller.configurationChanged({ file, text: configuredText(alpha), writable: true });
    await ready.promise;
    const older: Array<ConnectionConfiguration | undefined> = [], abandoned: Array<ConnectionConfiguration | undefined> = [];
    const current: Array<ConnectionConfiguration | undefined> = [];
    let replace = false;
    controller.observeWork({ configurationChanged: configuration => {
      older.push(configuration);
      if (!configuration && replace) {
        replace = false;
        controller.observeWork({ configurationChanged: value => current.push(value) });
      }
    } });
    replace = true;
    controller.observeWork({ configurationChanged: configuration => abandoned.push(configuration) });
    expect(older).toEqual([{ file, text: configuredText(alpha), writable: true }, undefined]);
    expect(abandoned).toEqual([]);
    expect(current).toEqual([{ file, text: configuredText(alpha), writable: true }]);
    controller.disconnect();
    expect(current.at(-1)).toBeUndefined();
  });

  it('cannot re-enable work after an observer disconnects during immediate activation', async () => {
    const { file, alpha } = await projectDirectories();
    const ready = deferred<void>();
    const { controller, states } = recordedConnection(state => { if (state.status === 'connected') ready.resolve(); });
    controller.configurationChanged({ file, text: configuredText(alpha), writable: true });
    await ready.promise;
    const work: Array<ConnectionConfiguration | undefined> = [];
    controller.observeWork({ configurationChanged: configuration => {
      work.push(configuration);
      if (configuration) controller.disconnect();
    } });
    expect(work).toEqual([{ file, text: configuredText(alpha), writable: true }, undefined]);
    expect(states.at(-1)).toMatchObject({ status: 'disconnected', target: alpha });
  });

  it('clears owned state on disposal even when work withdrawal reports a failure', async () => {
    const { file, alpha } = await projectDirectories();
    const ready = deferred<void>();
    const { controller, saves } = recordedConnection(state => { if (state.status === 'connected') ready.resolve(); });
    controller.configurationChanged({ file, text: configuredText(alpha), writable: true });
    await ready.promise;
    const failure = new Error('Work withdrawal failed.');
    let notifications = 0;
    controller.observeWork({ configurationChanged: configuration => {
      notifications++;
      if (!configuration) throw failure;
    } });
    expect(() => controller.dispose()).toThrow(failure);
    expect(controller.guidance()).toBeUndefined();
    expect(() => controller.dispose()).not.toThrow();
    controller.configurationChanged({ file, text: configuredText(alpha), writable: true });
    expect(notifications).toBe(2);
    expect(saves).toEqual([]);
  });

  it('disconnect invalidates an unsent creation request at actual directory verification', async () => {
    const { file, alpha, beta } = await projectDirectories();
    const ready = deferred<void>();
    const { controller, states, saves } = recordedConnection(state => { if (state.status === 'connected') ready.resolve(); });
    controller.configurationChanged({ file, text: configuredText(alpha), writable: true });
    await ready.promise;
    const held = heldConnector();
    controller.createConnection(beta, [{ id: 'typescript', directory: '.' }], []);
    await held.entered;
    controller.disconnect();
    held.release();
    await held.result();
    expect(saves).toEqual([]);
    expect(states.at(-1)).toMatchObject({ status: 'disconnected', target: alpha });
    expect(controller.guidance()?.configuration.text).toBe(configuredText(alpha));
  });

  it('legacy project-choice confirmation does not end an explicitly disconnected session', async () => {
    const { file, alpha, beta } = await projectDirectories();
    const ready = deferred<void>(), saved = deferred<SaveRequest>();
    const { controller, states } = recordedConnection(state => { if (state.status === 'connected') ready.resolve(); }, request => saved.resolve(request));
    const work: Array<ConnectionConfiguration | undefined> = [];
    controller.configurationChanged({ file, text: configuredText(alpha), writable: true });
    await ready.promise;
    controller.observeWork({ configurationChanged: configuration => work.push(configuration) });
    controller.disconnect();
    controller.chooseProject(beta);
    const request = await saved.promise;
    controller.configurationChanged({ file, text: request.text, writable: true });
    expect(states.at(-1)).toMatchObject({ status: 'disconnected', target: beta });
    expect(work.at(-1)).toBeUndefined();
  });

  it('attaches the requested replacement to a disconnect made during old observer withdrawal', async () => {
    const { file, alpha } = await projectDirectories();
    const initial = deferred<void>(), resumed = deferred<void>();
    let connected = 0;
    const { controller, states } = recordedConnection(state => {
      if (state.status === 'connected') {
        connected++;
        if (connected === 1) initial.resolve(); else resumed.resolve();
      }
    });
    controller.configurationChanged({ file, text: configuredText(alpha), writable: true });
    await initial.promise;
    let disconnect = false;
    controller.observeWork({ configurationChanged: configuration => {
      if (!configuration && disconnect) { disconnect = false; controller.disconnect(); }
    } });
    disconnect = true;
    const replacement: Array<ConnectionConfiguration | undefined> = [];
    controller.observeWork({ configurationChanged: configuration => replacement.push(configuration) });
    expect(states.at(-1)?.status).toBe('disconnected');
    expect(replacement).toEqual([undefined]);
    controller.reconnect();
    await resumed.promise;
    expect(replacement).toEqual([undefined, { file, text: configuredText(alpha), writable: true }]);
  });

  it('attaches the requested replacement to a newer saved selection made during withdrawal', async () => {
    const { file, alpha, beta } = await projectDirectories();
    const initial = deferred<void>(), selected = deferred<void>();
    const { controller } = recordedConnection(state => {
      if (state.status === 'connected' && state.target === alpha) initial.resolve();
      if (state.status === 'connected' && state.target === beta) selected.resolve();
    });
    controller.configurationChanged({ file, text: configuredText(alpha), writable: true });
    await initial.promise;
    let change = false;
    controller.observeWork({ configurationChanged: configuration => {
      if (!configuration && change) {
        change = false;
        controller.configurationChanged({ file, text: configuredText(beta), writable: true });
      }
    } });
    change = true;
    const replacement: Array<ConnectionConfiguration | undefined> = [];
    controller.observeWork({ configurationChanged: configuration => replacement.push(configuration) });
    await selected.promise;
    expect(replacement).toEqual([undefined, { file, text: configuredText(beta), writable: true }]);
  });

  it('immediately supplies verified work when an observer attaches from connected presentation', async () => {
    const { file, alpha } = await projectDirectories();
    const ready = deferred<void>(), work: Array<ConnectionConfiguration | undefined> = [];
    let controller: ConnectionController;
    const recorded = recordedConnection(state => {
      if (state.status === 'connected') {
        controller.observeWork({ configurationChanged: configuration => work.push(configuration) });
        ready.resolve();
      }
    });
    controller = recorded.controller;
    controller.configurationChanged({ file, text: configuredText(alpha), writable: true });
    await ready.promise;
    expect(work).toEqual([{ file, text: configuredText(alpha), writable: true }]);
  });
});
