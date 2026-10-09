import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { ExtensionContext } from 'vscode';
import type { GenerationShutdownFeedback } from '../../../src/core/GenerationShutdownFeedback.js';
import { GenerationHost } from '../../../src/vscode/GenerationHost.js';

const native = vi.hoisted(() => ({
  commands: new Map<string, () => Promise<void>>(), released: [] as string[],
  item: undefined as { text: string; tooltip?: string; disposed: boolean } | undefined,
  channel: undefined as { text: string; disposed: boolean } | undefined,
}));
vi.mock('vscode', () => {
  const release = (name: string) => ({ dispose: () => { native.released.push(name); native.commands.delete(name); } });
  return {
    Uri: { file: (file: string) => ({ toString: () => pathToFileURL(file).href }) }, StatusBarAlignment: { Left: 1 },
    commands: { registerCommand: (name: string, action: () => Promise<void>) => { native.commands.set(name, action); return release(name); } },
    workspace: { textDocuments: [],
      onDidOpenTextDocument: () => release('open'), onDidChangeTextDocument: () => release('change'),
      onDidCloseTextDocument: () => release('close'), onDidSaveTextDocument: () => release('save') },
    window: {
      createStatusBarItem: () => {
        const item = { text: '', disposed: false, show() {}, dispose() { item.disposed = true; } };
        native.item = item; return item;
      },
      createOutputChannel: () => {
        const channel = { text: '', disposed: false, append(text: string) { channel.text += text; },
          appendLine(text: string) { channel.text += text + '\n'; }, show() {}, dispose() { channel.disposed = true; } };
        native.channel = channel; return channel;
      },
      showErrorMessage: () => Promise.resolve(undefined),
    },
  };
});

function recording() {
  const values = new Map<string, boolean>();
  const updates: Array<{ key: string; value: boolean; finish(): void }> = [];
  const context = { subscriptions: [], workspaceState: {
    get: (key: string, fallback: boolean) => values.get(key) ?? fallback,
    update: (key: string, value: boolean) => {
      values.set(key, value);
      return new Promise<void>(done => updates.push({ key, value, finish: done }));
    },
  } } as unknown as ExtensionContext;
  let completion: GenerationShutdownFeedback | undefined;
  const host = new GenerationHost(context, { start() {}, cancel() {}, dispose: joined => { completion = joined; } });
  host.start();
  host.configurationChanged({ file: resolve('selected-expec.json'), text: '{saved}', writable: true });
  return { host, updates, values, finish: () => { if (!completion) throw Error('Worker shutdown was not requested.'); completion.stopped(undefined); } };
}

beforeEach(() => { native.commands.clear(); native.released = []; native.item = undefined; native.channel = undefined; });
describe('generation native author choices and shutdown', () => {
  it('a later disable remains current when an earlier enable finishes saving afterward', async () => {
    const r = recording();
    try {
      const enabling = native.commands.get('expec.enableGenerationOnSave')!();
      const disabling = native.commands.get('expec.disableGenerationOnSave')!();
      expect(r.updates.map(update => update.value)).toEqual([true, false]);
      r.updates[1].finish(); await disabling;
      expect(native.item!.text).toBe('.expec Generation: disabled');
      r.updates[0].finish(); await enabling;
      expect(native.item!.text).toBe('.expec Generation: disabled');
      expect([...r.values.values()]).toEqual([false]);
    } finally { r.host.dispose(); r.finish(); }
  });

  it('every joined shutdown receives completion and callback failures survive worker settlement', () => {
    const r = recording();
    const completed: Array<string | undefined> = [];
    const failure = new Error('first shutdown observer failed');
    r.host.shutdown({ stopped: () => { throw failure; } });
    r.host.shutdown({ stopped: error => { completed.push(error); } });
    expect(native.channel!.disposed).toBe(false);
    expect(native.item!.disposed).toBe(false);
    expect(native.released).toEqual(expect.arrayContaining(['open', 'change', 'close', 'save',
      'expec.enableGenerationOnSave', 'expec.disableGenerationOnSave', 'expec.generation.showLog']));
    const actualReport = '{"format":1,"status":"cancelled","effects":[{"state":"uncertain"}]}';
    r.host.record(resolve('selected-expec.json'), { report: actualReport, runtimeVersion: '24.19.0', exitCode: 130 });
    expect(native.channel!.text).toContain(actualReport);
    expect(() => r.finish()).not.toThrow();
    expect(completed).toHaveLength(1);
    expect(completed[0]).toContain('first shutdown observer failed');
    expect(native.channel!.disposed).toBe(true);
    expect(native.item!.disposed).toBe(true);
    r.host.shutdown({ stopped: error => { completed.push(error); } });
    expect(completed).toHaveLength(2);
    expect(completed[1]).toContain('first shutdown observer failed');
  });
});
