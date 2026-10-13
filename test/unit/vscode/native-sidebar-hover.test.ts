import { onTestFinished, describe, expect, it, vi } from 'vitest';
import { basename } from 'node:path';
import { ConnectionSidebarCase } from '../../driver/vscode/connection-sidebar.js';
import { ownTemporaryDirectory, removeOwnedDirectory } from '../../driver/vscode/native-process.js';
import type { VsCodeSession } from '../../driver/vscode/vscode-session.js';

/** Recorded UI operations isolate pointer/tooltip mechanics; installed behavior has native examples. */
async function sidebarHover(tooltip: (selectedFile: string) => readonly string[]) {
  const workspace = await ownTemporaryDirectory('expec-sidebar-hover-');
  const pointer: Array<{ kind: 'move' | 'hover'; x?: number; y?: number }> = [];
  let file = '';
  const box = { x: 48, y: 70, width: 300, height: 22 };
  const row = {
    async boundingBox() { return { ...box }; },
    async hover() { pointer.push({ kind: 'hover' }); },
  };
  const view = {
    async isVisible() { return true; },
    async innerText() { return basename(file) + ' — connected'; },
    getByRole(role: string) {
      if (role !== 'treeitem') throw new Error('Unexpected recorded view role.');
      return { filter: () => ({ first: () => row }) };
    },
  };
  const page = {
    mouse: { async move(x: number, y: number) { pointer.push({ kind: 'move', x, y }); } },
    locator(selector: string) {
      if (selector === '.monaco-workbench') return { count: async () => 1 };
      if (selector === '[id="workbench.view.extension.expec"]') return view;
      if (selector === '.monaco-hover:visible') return { allTextContents: async () => [...tooltip(file)] };
      throw new Error('Unexpected recorded workbench selector: ' + selector);
    },
  };
  const session = {
    async openConnectionSidebar(_id: string, _extension: string, setup: { file: string }) {
      file = setup.file; return { status: 'connected', project: 'shop', explanation: 'Recorded row.' };
    },
    async webviewBrowser() { return { contexts: () => [{ pages: () => [page] }] }; },
    async disposeConnectionSidebar() {},
  };
  const sidebar = new ConnectionSidebarCase(async () => session as unknown as VsCodeSession,
    'recorded.extension', '{}', [], workspace);
  onTestFinished(async () => {
    try { await sidebar.dispose(); } finally { await removeOwnedDirectory(workspace); }
  });
  await sidebar.open();
  return { sidebar, pointer, box };
}

describe('selected manifest hover mechanics', () => {
  it('leaves the actual row before hovering it to expose the selected full path', async () => {
    const actual = await sidebarHover(file => [file + '\nConnected.']);
    expect(await actual.sidebar.selectedConfigurationVisible()).toBe(true);
    expect(actual.pointer.map(action => action.kind)).toEqual(['move', 'hover']);
    const exit = actual.pointer[0]!;
    expect(exit.x! < actual.box.x || exit.x! > actual.box.x + actual.box.width
      || exit.y! < actual.box.y || exit.y! > actual.box.y + actual.box.height).toBe(true);
  });

  it('refuses a visible tooltip for a different manifest', async () => {
    const actual = await sidebarHover(() => ['C:/foreign/expec.json\nConnected.']);
    vi.useFakeTimers();
    try {
      const observed = actual.sidebar.selectedConfigurationVisible();
      await vi.runAllTimersAsync();
      expect(await observed).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it('refuses the selected basename when no full-path tooltip is displayed', async () => {
    const actual = await sidebarHover(() => []);
    vi.useFakeTimers();
    try {
      const observed = actual.sidebar.selectedConfigurationVisible();
      await vi.runAllTimersAsync();
      expect(await observed).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});
