import { createRequire } from 'node:module';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NativeCleanupError, ownTemporaryDirectory, removeOwnedDirectory } from '../../driver/vscode/native-process.js';

import { ConnectionSidebarCase } from '../../driver/vscode/connection-sidebar.js';

const { openConnectionSidebar } = createRequire(import.meta.url)('../../resources/vscode/native-host/connection-sidebar.cjs') as {
  openConnectionSidebar(vscode: unknown, id: string, setup: unknown): Promise<{ observation(): Promise<{ project: string; saved?: string }>; dispose(): Promise<void> }>;
};
const shop = '{"project":{"root":"shop"}}', library = '{"project":{"root":"library"}}';
const owned: Array<{ directory: string; sidebar: { dispose(): Promise<void> } }> = [];
afterEach(async () => { for (const host of owned.splice(0)) { try { await host.sidebar.dispose(); } finally { await removeOwnedDirectory(host.directory); } } });
function gate() {
  let release!: () => void, entered!: () => void;
  return { ready: new Promise<void>(resolve => { entered = resolve; }), wait: new Promise<void>(resolve => { release = resolve; }),
    enter: () => entered(), release: () => release() };
}

// This records only native provider/event mechanics. Real file bytes are read;
// connection policy is exercised separately through the real installed product.
async function sidebarHost(failWatcherDisposal = false) {
  const directory = await ownTemporaryDirectory('expec-sidebar-observation-');
  const file = join(directory, 'expec.json'), resetFile = join(directory, 'reset.json');
  await writeFile(file, shop);
  const released: string[] = []; let failCleanup = false, failResetRead = false;
  const subscriptions = new Set<() => void>(), fileSubscriptions = new Set<(uri: { fsPath: string; toString(): string }) => void>();
  let child = { configurationFile: file, project: 'shop' }, itemGate: ReturnType<typeof gate> | undefined, readGate: ReturnType<typeof gate> | undefined;
  const publish = () => { for (const receive of subscriptions) receive(); };
  const provider = {
    start(filename: string) { child = { configurationFile: filename, project: filename === file ? 'shop' : '' }; publish(); queueMicrotask(publish); },
    getChildren: async () => { if (failResetRead && child.configurationFile === resetFile) throw new Error('Native reset observation failed.'); return [child]; },
    async getTreeItem(captured: typeof child) {
      const held = itemGate; itemGate = undefined;
      if (held) { held.enter(); await held.wait; }
      return { contextValue: captured.project ? 'connected' : 'unconfigured', description: captured.project ? join(directory, captured.project) : undefined, tooltip: 'Observed native row.' };
    },
    onDidChangeTreeData(receive: () => void) { subscriptions.add(receive); return { dispose: () => { released.push('tree'); subscriptions.delete(receive); } }; },
  };
  const uri = (fsPath: string) => ({ fsPath, toString: () => 'file:' + fsPath });
  const watched = (name: string) => (receive: (value: ReturnType<typeof uri>) => void) => { fileSubscriptions.add(receive); return { dispose: () => { released.push(name); fileSubscriptions.delete(receive); } }; };
  const vscode = {
    extensions: { getExtension: () => ({ activate: async () => ({ connectionTreeProvider: provider }) }) },
    Uri: { file: uri }, RelativePattern: class { constructor(readonly base: unknown, readonly pattern: string) {} },
    window: { tabGroups: { all: [] } },
    workspace: { textDocuments: [], createFileSystemWatcher: () => ({ onDidCreate: watched('create'), onDidChange: watched('change'), onDidDelete: watched('delete'), dispose() { released.push('watcher'); if (failCleanup) throw new Error('Native watcher cleanup failed.'); } }),
      fs: {
        async readFile(resource: ReturnType<typeof uri>) {
          const held = resource.fsPath === file ? readGate : undefined; if (held) { readGate = undefined; held.enter(); await held.wait; }
          return readFile(resource.fsPath);
        },
        async writeFile(resource: ReturnType<typeof uri>, bytes: Uint8Array) {
          await writeFile(resource.fsPath, bytes); for (const receive of fileSubscriptions) receive(resource);
        },
      },
    },
  };
  const sidebar = await openConnectionSidebar(vscode, 'installed.expec', { file, directory, resetFile });
  owned.push({ directory, sidebar });
  released.length = 0;
  return { sidebar, released, failCleanup: () => { failCleanup = failWatcherDisposal; }, failResetRead: () => { failResetRead = true; },
    holdItem: () => itemGate = gate(), holdSavedRead: () => readGate = gate(),
    async replaceSaved() { await writeFile(file, library); child = { configurationFile: file, project: 'library' }; publish(); },
  };
}

describe('current installed sidebar observations', () => {
  it('retries a stale native TreeItem instead of pairing it with newer saved bytes', async () => {
    const host = await sidebarHost(), held = host.holdItem();
    const observation = host.sidebar.observation();
    await held.ready; await host.replaceSaved(); held.release();
    expect(await observation).toMatchObject({ project: 'library', saved: library });
  });

  it('retries when native publication changes while the actual saved file is being read', async () => {
    const host = await sidebarHost(), held = host.holdSavedRead();
    const observation = host.sidebar.observation();
    await held.ready; await host.replaceSaved(); held.release();
    expect(await observation).toMatchObject({ project: 'library', saved: library });
  });
});

describe('owned native sidebar cleanup', () => {
  it('attempts every native listener release even when the owned watcher throws', async () => {
    const host = await sidebarHost(true);
    host.failCleanup();
    await expect(host.sidebar.dispose()).rejects.toThrow('Native watcher cleanup failed.');
    expect(host.released).toEqual(['watcher', 'create', 'change', 'delete', 'tree']);
  });

  it('preserves the primary reset failure together with a native resource release failure', async () => {
    const host = await sidebarHost(true), ownership = owned.pop()!;
    try {
      host.failCleanup(); host.failResetRead();
      const error = await host.sidebar.dispose().catch(error => error as unknown);
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors.map(error => error.message)).toEqual(['Native reset observation failed.', 'Native watcher cleanup failed.']);
      expect(host.released).toEqual(['watcher', 'create', 'change', 'delete', 'tree']);
    } finally {
      // No native process is launched by this mechanics recorder. Its failed
      // disposal is the observation; do not retry it during fixture cleanup.
      await removeOwnedDirectory(ownership.directory);
    }
  });
  it('retains owned case files when native session acquisition reports unconfirmed ownership', async () => {
    const workspace = await ownTemporaryDirectory('expec-sidebar-acquisition-');
    let directory: string | undefined;
    try {
      const sidebar = new ConnectionSidebarCase(async () => { throw new NativeCleanupError('Native ownership is unconfirmed.'); }, 'installed.expec', shop, [], workspace);
      await expect(sidebar.open()).rejects.toThrow('Native ownership is unconfirmed.');
      directory = join(workspace, (await readdir(workspace))[0]!);
      await expect(sidebar.dispose()).rejects.toThrow('cleanup is unconfirmed');
      expect((await stat(directory)).isDirectory()).toBe(true);
    } finally {
      if (directory && await stat(directory).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) await removeOwnedDirectory(directory);
      await removeOwnedDirectory(workspace);
    }
  });
});