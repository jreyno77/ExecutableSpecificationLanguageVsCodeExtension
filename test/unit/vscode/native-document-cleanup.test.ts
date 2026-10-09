import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { openDiagnosticDocument } = createRequire(import.meta.url)('../../../test/resources/vscode/native-host/diagnostic-document.cjs') as {
  openDiagnosticDocument(vscode: unknown, id: string, setup: unknown): Promise<{ dispose(): Promise<void>; close(): Promise<{ closed: boolean }> }>;
};

afterEach(() => vi.useRealTimers());

// Only native cleanup is recorded here; compiler answers and editor acceptance
// assertions remain in the real installed-host suite.
function ownedUntitled(closeMode: 'closed' | 'retained' | 'pending' = 'closed') {
  const listeners = new Map<string, Set<(event: any) => void>>();
  const event = (name: string) => (receive: (value: any) => void) => {
    const entries = listeners.get(name) ?? new Set();
    listeners.set(name, entries); entries.add(receive);
    return { dispose: () => entries.delete(receive) };
  };
  const emit = (name: string, value: unknown) => { for (const receive of listeners.get(name) ?? []) receive(value); };
  let text = 'type Draft {', commandCalls = 0, edits = 0;
  const document = { uri: { scheme: 'untitled', toString: () => 'untitled:Draft' }, version: 1,
    isDirty: true, isClosed: false, getText: () => text, positionAt: (offset: number) => offset };
  const own = { isDirty: true, input: { uri: document.uri } }, other = { isDirty: true, input: { uri: { toString: () => 'untitled:Other' } } };
  const duplicate = { isDirty: true, input: { uri: document.uri } };
  const tabs = [own, other, duplicate];
  const closedTabs: unknown[][] = [];
  const client = { getFeature(name: string) {
    return name === 'textDocument/diagnostic'
      ? { getState: () => ({ registrations: true }), getProvider: () => ({ diagnostics: {
        provideDiagnostics: async () => ({ kind: 'full', resultId: 'current', items: [] }),
      } }) }
      : { onNotificationSent: event(name) };
  } };
  const window = { activeTextEditor: { document }, visibleTextEditors: [{ document }],
    showTextDocument: async () => { emit('textDocument/didOpen', { textDocument: document, params: { textDocument: { version: document.version } } }); return { document }; },
    tabGroups: { all: [{ tabs }], onDidChangeTabs: event('tabs'), close: async (actual: unknown[]) => {
      closedTabs.push(actual);
      if (closeMode === 'pending') return new Promise<boolean>(() => {});
      if (closeMode === 'retained') return false;
      for (const tab of actual) tabs.splice(tabs.indexOf(tab as typeof own), 1);
      window.visibleTextEditors = []; document.isClosed = true;
      emit('tabs', { closed: actual }); emit('closed', document);
      emit('textDocument/didClose', { textDocument: document });
      emit('diagnostics', { uris: [document.uri] });
      return true;
    } },
  };
  const vscode = { extensions: { getExtension: () => ({ activate: async () => client }) }, window,
    workspace: { openTextDocument: async () => document, textDocuments: [document], onDidCloseTextDocument: event('closed'),
      applyEdit: async (edit: { edits?: { newText: string }[] }) => {
        edits++; text = edit.edits![0]!.newText; own.isDirty = duplicate.isDirty = text !== ''; document.version++;
        return true;
      } },
    languages: { getDiagnostics: () => [], onDidChangeDiagnostics: event('diagnostics') },
    commands: { executeCommand: () => { commandCalls++; return new Promise<void>(() => {}); } },
    WorkspaceEdit: class { edits?: unknown[]; set(_uri: unknown, values: unknown[]) { this.edits = values; } },
    Range: class { constructor(readonly start: unknown, readonly end: unknown) {} },
    TextEdit: { replace: (_range: unknown, newText: string) => ({ newText }) },
    CancellationTokenSource: class { token = {}; dispose() {} },
  };
  return { open: () => openDiagnosticDocument(vscode, 'installed.expec', { untitled: true, text }),
    document, own, duplicate, other, closedTabs, calls: () => ({ commandCalls, edits }), listeners };
}

describe('owned native document cleanup', () => {
  it('discards its untitled text and closes only its actual tabs without an active-editor command', async () => {
    vi.useFakeTimers();
    const host = ownedUntitled();
    const document = await host.open();
    const result = Promise.race([document.close().then(value => value.closed), new Promise(resolve => setTimeout(() => resolve('pending'), 31_000))]);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(await result).toBe(true);
    expect(host.document.getText()).toBe('');
    expect(host.document.isDirty).toBe(true);
    expect(host.own.isDirty).toBe(false);
    expect(host.closedTabs).toEqual([[host.own, host.duplicate]]);
    expect(host.calls()).toEqual({ commandCalls: 0, edits: 1 });
    await document.dispose();
  });

  it('keeps a refused native tab close observable instead of confirming cleanup', async () => {
    vi.useFakeTimers();
    const host = ownedUntitled('retained');
    const document = await host.open();
    const disposal = document.dispose();
    const failed = expect(disposal).rejects.toThrow('VS Code refused to close the owned native tabs.');
    await vi.advanceTimersByTimeAsync(30_001);
    await failed;
    expect(host.document.isClosed).toBe(false);
    expect(host.listeners.get('tabs')?.size).toBe(0);
  });

  it('bounds a native tab close that never settles within the existing cleanup deadline', async () => {
    vi.useFakeTimers();
    const host = ownedUntitled('pending');
    const document = await host.open();
    const disposal = document.dispose();
    const failed = expect(disposal).rejects.toThrow('The owned native tab close did not finish before its cleanup deadline.');
    await vi.advanceTimersByTimeAsync(30_001);
    await failed;
    expect(host.document.isClosed).toBe(false);
    expect(host.listeners.get('tabs')?.size).toBe(0);
  });
});
