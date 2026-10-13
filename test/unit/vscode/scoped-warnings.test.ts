import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ConfigurationReader } from 'executable-specification-language';
import type { Connection, DocumentDiagnosticReport } from 'vscode-languageserver/node';
import { LanguageServerAdapter } from '../../../src/vscode/LanguageServerAdapter.js';
import type { ConnectionConfiguration } from '../../../src/core/ConnectionConfiguration.js';
import type { DocumentReport } from '../../../src/core/DocumentReport.js';

const source = { uri: 'file:///workspace/src/view.expec', text: 'type View {}' };
const invalidText = '{"formatVersion":1,"version":"0.1.0","build":{"entries":["src/view.expec"]},"outputs":[],"packages":[{"alias":"react","name":"npm:react","version":"19.3.0","phases":["runtime"]}],"requirements":{"files":[{"path":"src/view.expec","test":["react"]}]}}';
const invalid = { file: resolve('test-owned-scope', 'expec.json'), text: invalidText, writable: true };

function scopeReport(configuration: ConnectionConfiguration): DocumentReport {
  const checked = new ConfigurationReader([]).read({ sourceId: configuration.file, text: configuration.text! });
  if (!checked.problems.length) throw new Error('The independently supplied invalid scope fixture has no actual SDK finding.');
  return { syntax: [], sources: [source], dependencies: [], requirements: [], dependencyProblems: [...checked.problems] };
}

// The real adapter invokes recorded public LSP operations. Findings come from the
// shipped SDK reader, never from the adapter or a locally predicted answer.
function warningServer(onWarning?: (message: string) => unknown, onError?: (message: string) => void) {
  const callbacks = new Map<string, (...args: any[]) => any>();
  const visible: string[] = [], logged: string[] = [];
  const listen = (name: string) => (callback: (...args: any[]) => any) => {
    callbacks.set(name, callback); return { dispose() {} };
  };
  const connection = {
    onInitialize: listen('initialize'), onInitialized: listen('initialized'),
    onDefinition: listen('definition'), onHover: listen('hover'), onDocumentSymbol: listen('symbols'), onCompletion: listen('completion'), onReferences: listen('references'),
    onNotification: (name: string, callback: (...args: any[]) => any) => listen(name)(callback),
    onDidChangeWatchedFiles: listen('watched'),
    onDidOpenTextDocument: listen('opened'), onDidChangeTextDocument: listen('changed'), onDidCloseTextDocument: listen('closed'),
    onWillSaveTextDocument: listen('willSave'), onWillSaveTextDocumentWaitUntil: listen('willSaveWaitUntil'), onDidSaveTextDocument: listen('saved'),
    sendNotification: () => Promise.resolve(),
    languages: { diagnostics: { on: listen('diagnostics'), refresh: () => Promise.resolve() } },
    console: { warn: (message: string) => logged.push(message), error: (message: string) => { logged.push(message); onError?.(message); } },
    window: { showWarningMessage: (message: string) => { visible.push(message); return onWarning?.(message); } },
  } as unknown as Connection;
  const adapter = new LanguageServerAdapter(connection, { read: () => undefined, localPath: () => undefined });
  adapter.start();
  return {
    adapter, visible, logged,
    configure(configuration: ConnectionConfiguration | undefined) {
      callbacks.get('expec/previewConfiguration')!({ configuration });
    },
    pull() {
      return callbacks.get('diagnostics')!({ textDocument: { uri: source.uri } }) as Extract<DocumentDiagnosticReport, { kind: 'full' }>;
    },
  };
}

describe('visible scoped configuration findings at the public LSP boundary', () => {
  it('shows the actual code message and manifest path without a fabricated source range or report mutation', () => {
    const server = warningServer(), report = scopeReport(invalid), before = JSON.stringify(report);
    try {
      server.configure(invalid);
      server.adapter.publish(source, 4, report);
      expect(server.visible).toHaveLength(1);
      expect(server.visible[0]).toContain('[unavailable-package]');
      expect(server.visible[0]).toContain(report.dependencyProblems![0]!.message);
      expect(server.visible[0]).toContain(JSON.stringify(['manifest', invalid.file, 'requirements', 'files', 0, 'test', 0]));
      expect(server.pull().items).toEqual([]);
      expect(JSON.stringify(report)).toBe(before);
    } finally { server.adapter.dispose(); }
  });

  it('deduplicates identical saved configuration findings across typing documents and writable changes', () => {
    const server = warningServer(), report = scopeReport(invalid);
    try {
      server.configure(invalid);
      server.adapter.publish(source, 4, report);
      server.configure({ ...invalid, writable: false });
      server.adapter.publish({ ...source, text: 'type Changed {}' }, 5, report);
      server.adapter.publish({ uri: 'untitled:Other', text: 'type Other {}' }, 1, report);
      expect(server.visible).toHaveLength(1);
    } finally { server.adapter.dispose(); }
  });

  it('does not reuse a warning after saved text manifest identity or selection changes', () => {
    const server = warningServer();
    try {
      server.configure(invalid); server.adapter.publish(source, 4, scopeReport(invalid));
      const changed = { ...invalid, text: invalid.text + '\n' };
      server.configure(changed); server.adapter.publish(source, 4, scopeReport(changed));
      const other = { ...invalid, file: resolve('another-owned-scope', 'expec.json') };
      server.configure(other); server.adapter.publish(source, 4, scopeReport(other));
      server.configure(undefined);
      server.configure(other); server.adapter.publish(source, 4, scopeReport(other));
      expect(server.visible).toHaveLength(4);
      expect(server.visible[2]).toContain(JSON.stringify(other.file));
    } finally { server.adapter.dispose(); }
  });

  it('stops older warning and diagnostic projection when a visible warning reenters with a new saved configuration', () => {
    const older = { ...invalid, text: invalid.text.replace('["react"]', '["react","missing"]') };
    const newer = { ...invalid, file: resolve('new-owned-scope', 'expec.json') };
    let reenter = true, nestedResultId: string | undefined;
    const server = warningServer(() => {
      if (!reenter) return;
      reenter = false;
      server.configure(newer);
      server.adapter.publish(source, 4, scopeReport(newer));
      nestedResultId = server.pull().resultId;
    });
    try {
      server.configure(older);
      server.adapter.publish(source, 4, scopeReport(older));
      expect(server.visible).toHaveLength(2);
      expect(server.visible[0]).toContain(JSON.stringify(older.file));
      expect(server.visible[1]).toContain(JSON.stringify(newer.file));
      expect(server.visible.every(message => !message.includes('[unknown-package-alias]'))).toBe(true);
      expect(server.pull().resultId).toBe(nestedResultId);
    } finally { server.adapter.dispose(); }
  });

  it('deduplicates a same-configuration report that reenters the visible warning callback', () => {
    let reenter = true;
    const server = warningServer(() => {
      if (!reenter) return;
      reenter = false;
      server.adapter.publish(source, 4, scopeReport(invalid));
    });
    try {
      server.configure(invalid);
      server.adapter.publish(source, 4, scopeReport(invalid));
      expect(server.visible).toHaveLength(1);
    } finally { server.adapter.dispose(); }
  });

  it('logs an asynchronous warning refusal and permits another actual attempt', async () => {
    const failure = new Error('The native warning transport rejected'), reply = Promise.reject(failure);
    // The fixture observes its original rejected reply to keep an ignored reply
    // from escaping Vitest; only the adapter can produce the native error log.
    void reply.catch(() => undefined);
    const server = warningServer(() => reply);
    try {
      server.configure(invalid);
      server.adapter.publish(source, 4, scopeReport(invalid));
      await reply.catch(() => undefined); await Promise.resolve();
      expect(server.logged.some(message => message.includes(String(failure)))).toBe(true);
      server.adapter.publish(source, 4, scopeReport(invalid));
      await reply.catch(() => undefined); await Promise.resolve();
      expect(server.visible).toHaveLength(2);
    } finally { server.adapter.dispose(); }
  });

  it('does not erase a newer configuration warning when an older asynchronous transport refuses', async () => {
    const failure = new Error('The older native warning transport rejected');
    let refuse!: (error: Error) => void, first = true;
    const reply = new Promise<undefined>((_resolve, reject) => { refuse = reject; });
    void reply.catch(() => undefined);
    const server = warningServer(() => { if (first) { first = false; return reply; } });
    const newer = { ...invalid, text: invalid.text + '\n' };
    try {
      server.configure(invalid); server.adapter.publish(source, 4, scopeReport(invalid));
      server.configure(newer); server.adapter.publish(source, 4, scopeReport(newer));
      const currentId = server.pull().resultId;
      refuse(failure);
      await reply.catch(() => undefined); await Promise.resolve();
      expect(server.logged.some(message => message.includes(String(failure)))).toBe(true);
      expect(server.pull().resultId).toBe(currentId);
      server.adapter.publish(source, 4, scopeReport(newer));
      expect(server.visible).toHaveLength(2);
    } finally { server.adapter.dispose(); }
  });

  it('contains asynchronous shutdown logging failures and reports the original refusal to stderr', async () => {
    const failure = new Error('The shutdown warning transport rejected'), loggingFailure = new Error('The native logger is disposed');
    const reply = Promise.reject(failure); void reply.catch(() => undefined);
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const server = warningServer(() => reply, () => { throw loggingFailure; });
    try {
      server.configure(invalid);
      server.adapter.publish(source, 4, scopeReport(invalid));
      await reply.catch(() => undefined); await Promise.resolve();
      expect(stderr).toHaveBeenCalledWith('Scoped configuration warning failed: ' + String(failure), loggingFailure);
    } finally { stderr.mockRestore(); server.adapter.dispose(); }
  });

  it('surfaces a native warning callback failure instead of silently suppressing the next attempt', () => {
    const failure = new Error('The native visible warning failed'), server = warningServer(() => { throw failure; });
    try {
      server.configure(invalid);
      expect(() => server.adapter.publish(source, 4, scopeReport(invalid))).toThrow(failure);
      expect(() => server.adapter.publish(source, 4, scopeReport(invalid))).toThrow(failure);
      expect(server.visible).toHaveLength(2);
    } finally { server.adapter.dispose(); }
  });
});

