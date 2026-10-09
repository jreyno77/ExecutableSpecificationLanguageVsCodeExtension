import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { ProjectConnector } from 'executable-specification-language';
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
