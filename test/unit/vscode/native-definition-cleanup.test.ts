import { createRequire } from 'node:module';
import { expect, it } from 'vitest';

const { openSourceDefinition } = createRequire(import.meta.url)('../../../test/resources/vscode/native-host/source-definition.cjs') as {
  openSourceDefinition(vscode: unknown, id: string, files: Readonly<Record<string, string>>): Promise<{
    edit(kind: string, text: string): Promise<unknown>; goTo(line: number, character: number): Promise<unknown>; dispose(): Promise<void>;
  }>;
};

// Recorded native ports test cleanup only; actual language/navigation claims use the installed host.
it('discards an owned hidden dirty import after its real definition helper query rejects', async () => {
  const host = ownedDefinitionPorts();
  const definition = await openSourceDefinition(host.vscode, 'installed.expec', { 'entry.expec': '/owned/entry.expec', 'book.expec': '/owned/book.expec' });
  await definition.edit('import', 'Unsaved owned import');
  expect(host.book.isDirty).toBe(true);
  expect(host.tabs.some(tab => tab.input.uri === host.book.uri)).toBe(false);
  await expect(definition.goTo(0, 0)).rejects.toBe(host.providerFailure);

  await definition.dispose();

  expect(host.book.isDirty, 'A hidden owned buffer must be discarded before case-tree removal can be confirmed.').toBe(false);
  expect(host.book.getText()).toBe('Saved owned import');
  expect(host.reverted).toContain(host.book.uri.toString());
  expect(host.tabs.map(tab => tab.input.uri.toString())).toEqual([host.other.uri.toString()]);
  expect(host.other.isDirty).toBe(true);
  expect([...host.listeners.values()].reduce((total, receivers) => total + receivers.size, 0)).toBe(0);
});

function ownedDefinitionPorts() {
  type Uri = { fsPath: string; toString(): string };
  type Position = { line: number; character: number };
  type Document = { uri: Uri; version: number; isDirty: boolean; isClosed: boolean; saved: string; text: string; getText(): string; positionAt(offset: number): Position };
  type Notification = { textDocument: Document; params: { textDocument: { version: number } } };
  const uri = (file: string): Uri => ({ fsPath: file, toString: () => 'file://' + file });
  const make = (file: string, saved: string): Document => ({ uri: uri(file), version: 1, isDirty: false, isClosed: false, saved, text: saved,
    getText() { return this.text; }, positionAt: offset => ({ line: 0, character: offset }) });
  const entry = make('/owned/entry.expec', 'Saved owned entry');
  const book = make('/owned/book.expec', 'Saved owned import');
  const other = make('/unrelated/other.expec', 'Unrelated dirty buffer'); other.isDirty = true;
  const documents = [entry, book, other];
  const tabs = [{ input: { uri: other.uri } }];
  const listeners = new Map<string, Set<(event: Notification) => void>>();
  const event = (name: string) => (receive: (value: Notification) => void) => {
    const receivers = listeners.get(name) ?? new Set(); listeners.set(name, receivers); receivers.add(receive);
    return { dispose: () => receivers.delete(receive) };
  };
  const emit = (name: string, document: Document) => {
    for (const receive of listeners.get(name) ?? []) receive({ textDocument: document, params: { textDocument: { version: document.version } } });
  };
  let reportSequence = 0;
  const client = { getFeature(name: string) {
    return name === 'textDocument/diagnostic'
      ? { getProvider: () => ({ diagnostics: { provideDiagnostics: async () => ({ kind: 'full', resultId: 'report-' + reportSequence, items: [] }) } }) }
      : { onNotificationSent: event(name) };
  } };
  const providerFailure = new Error('Actual recorded native definition provider rejected.');
  const reverted: string[] = [];
  const visible: { document: Document }[] = [];
  let active: { document: Document; selection: { active: Position }; revealRange(): void } | undefined;
  class WorkspaceEdit {
    values: { uri: Uri; edits: { newText: string }[] }[] = [];
    set(actual: Uri, edits: { newText: string }[]) { this.values.push({ uri: actual, edits }); }
  }
  const vscode = {
    extensions: { getExtension: () => ({ activate: async () => client }) },
    Uri: { file: uri },
    workspace: { textDocuments: documents,
      openTextDocument: async (actual: Uri) => {
        const document = documents.find(candidate => candidate.uri.toString() === actual.toString());
        if (!document) throw new Error('Unknown test-owned native document.');
        emit('textDocument/didOpen', document); return document;
      },
      applyEdit: async (edit: WorkspaceEdit) => {
        for (const value of edit.values) {
          const document = documents.find(candidate => candidate.uri.toString() === value.uri.toString())!;
          document.text = value.edits[0].newText; document.version++; document.isDirty = document.text !== document.saved;
          reportSequence++; emit('textDocument/didChange', document);
        }
        return true;
      },
    },
    window: {
      get activeTextEditor() { return active; }, visibleTextEditors: visible, tabGroups: { all: [{ tabs }] },
      showTextDocument: async (document: Document) => {
        if (!tabs.some(tab => tab.input.uri === document.uri)) tabs.push({ input: { uri: document.uri } });
        active = { document, selection: { active: { line: 0, character: 0 } }, revealRange() {} };
        visible.splice(0, visible.length, { document }); return active;
      },
    },
    languages: { getDiagnostics: () => [] },
    commands: { executeCommand: async (name: string) => {
      if (name === 'vscode.executeDefinitionProvider') throw providerFailure;
      if (name !== 'workbench.action.revertAndCloseActiveEditor' || !active) throw new Error('Unexpected recorded native command.');
      const document = active.document;
      reverted.push(document.uri.toString()); document.text = document.saved; document.isDirty = false;
      const own = tabs.findIndex(tab => tab.input.uri === document.uri); if (own >= 0) tabs.splice(own, 1);
      visible.splice(0); active = undefined;
    } },
    WorkspaceEdit, Range: class { constructor(readonly start: Position, readonly end: Position) {} },
    Position: class { constructor(readonly line: number, readonly character: number) {} },
    Selection: class { active: Position; constructor(_start: Position, end: Position) { this.active = end; } },
    TextEdit: { replace: (_range: unknown, newText: string) => ({ newText }) },
    CancellationTokenSource: class { token = {}; dispose() {} }, CancellationError: class extends Error {},
  };
  return { vscode, book, other, tabs, reverted, listeners, providerFailure };
}
