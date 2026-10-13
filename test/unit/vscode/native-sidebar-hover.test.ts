import { onTestFinished, describe, expect, it, vi } from 'vitest';
import { basename } from 'node:path';
import { ConnectionSidebarCase } from '../../driver/vscode/connection-sidebar.js';
import { ownTemporaryDirectory, removeOwnedDirectory } from '../../driver/vscode/native-process.js';
import type { VsCodeSession } from '../../driver/vscode/vscode-session.js';

/** Recorded UI operations isolate pointer/tooltip mechanics; installed behavior has native examples. */
async function sidebarHover(tooltip: (selectedFile: string) => readonly string[], mode: 'immediate' | 'delayed' | 'rebound' | 'covered' | 'transport-failed' | 'absent' = 'immediate', delay = 500) {
  const workspace = await ownTemporaryDirectory('expec-sidebar-hover-');
  const pointer: Array<{ kind: 'move' | 'hover'; x?: number; y?: number }> = [];
  let file = '', entries = 0, hoverReady = mode === 'immediate', timer: ReturnType<typeof setTimeout> | undefined;
  const box = { x: 48, y: 70, width: 300, height: 22 };
  const row = {
    async boundingBox() { return { ...box }; },
    async hover(options?: { timeout?: number }) {
      pointer.push({ kind: 'hover' }); entries++;
      if (mode === 'covered' || mode === 'transport-failed') {
        if (entries > 1) return new Promise<void>((_resolve, reject) => setTimeout(() => reject(mode === 'covered' ? Object.assign(new Error('The covered row did not receive a hover.'), { name: 'TimeoutError' }) : new Error('Workbench mouse transport closed.')), options?.timeout ?? 30_000));
        return;
      }
      if (mode !== 'immediate') {
        timer = setTimeout(() => { hoverReady = true; }, delay);
        if (mode === 'rebound' && entries === 1) setTimeout(() => { clearTimeout(timer); hoverReady = false; }, 100);
      }
    },
  };
  const view = {
    async isVisible() { return true; },
    async innerText() { return mode === 'absent' ? 'Another view' : basename(file) + ' — connected'; },
    getByRole(role: string) {
      if (role !== 'treeitem') throw new Error('Unexpected recorded view role.');
      return { filter: () => ({ first: () => row }) };
    },
  };
  const page = {
    mouse: { async move(x: number, y: number) { pointer.push({ kind: 'move', x, y }); if (mode !== 'immediate') { clearTimeout(timer); hoverReady = false; } } },
    locator(selector: string) {
      if (selector === '.monaco-workbench') return { count: async () => 1 };
      if (selector === '[id="workbench.view.extension.expec"]') return view;
      if (selector === '.monaco-hover:visible') return { allTextContents: async () => hoverReady ? [...tooltip(file)] : [] };
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

describe('native hover registration after row publications', () => {
  it('re-enters after a publication invalidates the first hover and observes the actual delayed full-path tooltip', async () => {
    const actual = await sidebarHover(file => [file + '\nConnected.'], 'rebound');
    vi.useFakeTimers();
    try {
      const began = Date.now(), observed = actual.sidebar.selectedConfigurationVisible();
      await vi.runAllTimersAsync();
      expect(await observed).toBe(true);
      expect(Date.now() - began).toBeLessThanOrEqual(3_000);
      expect(actual.pointer.filter(action => action.kind === 'hover').length).toBeGreaterThan(1);
    } finally { vi.useRealTimers(); }
  });

  it('gives the normal 500 ms tooltip time to appear without resetting its timer', async () => {
    const actual = await sidebarHover(file => [file + '\nConnected.'], 'delayed');
    vi.useFakeTimers();
    try {
      const observed = actual.sidebar.selectedConfigurationVisible();
      await vi.runAllTimersAsync();
      expect(await observed).toBe(true);
      expect(actual.pointer.map(action => action.kind)).toEqual(['move', 'hover']);
    } finally { vi.useRealTimers(); }
  });

  it('keeps a covered row false within the original deadline when re-entry cannot reach it', async () => {
    const actual = await sidebarHover(file => [file + '\nConnected.'], 'covered');
    vi.useFakeTimers();
    try {
      const began = Date.now(), observed = actual.sidebar.selectedConfigurationVisible();
      await vi.runAllTimersAsync();
      expect(await observed).toBe(false);
      expect(Date.now() - began).toBeLessThanOrEqual(3_000);
    } finally { vi.useRealTimers(); }
  });

  it('does not hover another view when the selected manifest label is absent', async () => {
    const actual = await sidebarHover(file => [file + '\nConnected.'], 'absent');
    expect(await actual.sidebar.selectedConfigurationVisible()).toBe(false);
    expect(actual.pointer).toEqual([]);
  });
  it('retains a normal 1500 ms tooltip inside the original three-second deadline', async () => {
    const actual = await sidebarHover(file => [file + '\nConnected.'], 'delayed', 1500);
    vi.useFakeTimers();
    try {
      const began = Date.now(), observed = actual.sidebar.selectedConfigurationVisible();
      await vi.runAllTimersAsync();
      expect(await observed).toBe(true);
      expect(Date.now() - began).toBeLessThanOrEqual(3_000);
    } finally { vi.useRealTimers(); }
  });
  it('preserves a real non-timeout transport failure after the deadline instead of reporting a missing tooltip', async () => {
    const actual = await sidebarHover(file => [file + '\nConnected.'], 'transport-failed');
    vi.useFakeTimers();
    try {
      const outcome = actual.sidebar.selectedConfigurationVisible().then(value => ({ value, error: undefined }), error => ({ value: undefined, error }));
      await vi.runAllTimersAsync();
      const observed = await outcome;
      expect(observed.error).toBeInstanceOf(Error);
      expect(observed.error?.message).toBe('Workbench mouse transport closed.');
    } finally { vi.useRealTimers(); }
  });
});
