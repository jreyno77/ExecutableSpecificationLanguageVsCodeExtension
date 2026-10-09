import { describe, expect, it } from 'vitest';
import type { Connection, Disposable, DocumentDiagnosticReport } from 'vscode-languageserver/node';
import { LanguageServerAdapter } from '../../../src/vscode/LanguageServerAdapter.js';
import type { DocumentSources } from '../../../src/core/DocumentSources.js';
import type { DocumentReport } from '../../../src/core/DocumentReport.js';
import type { SourceDocument } from '../../../src/core/SourceDocument.js';

// A narrow native-connection recorder: the real adapter registers and invokes these
// protocol operations. It never parses source or supplies an expected compiler answer.
function recordedServer(sources: DocumentSources = { read: () => undefined }) {
  const callbacks = new Map<string, (params: any) => any>();
  const released: string[] = [], warnings: string[] = [], errors: string[] = [];
  const registrations: Array<{ options: unknown; complete: (registration: Disposable) => void }> = [];
  const listen = (name: string) => (callback: (params: any) => any) => {
    callbacks.set(name, callback);
    return { dispose: () => { released.push(name); } };
  };
  const connection = {
    onInitialize: listen('initialize'), onInitialized: listen('initialized'),
    onDidChangeWatchedFiles: listen('watched'),
    onDidOpenTextDocument: listen('opened'), onDidChangeTextDocument: listen('changed'),
    onDidCloseTextDocument: listen('closed'), onWillSaveTextDocument: listen('willSave'),
    onWillSaveTextDocumentWaitUntil: listen('willSaveWaitUntil'), onDidSaveTextDocument: listen('saved'),
    languages: { diagnostics: { on: listen('diagnostics'), refresh: () => Promise.resolve() } },
    console: { warn: (message: string) => { warnings.push(message); }, error: (message: string) => { errors.push(message); } },
    client: { register: (_type: unknown, options: unknown) => new Promise<Disposable>(complete => { registrations.push({ options, complete }); }) },
  } as unknown as Connection;
  const adapter = new LanguageServerAdapter(connection, sources);
  adapter.start();
  callbacks.get('initialize')!({ capabilities: { workspace: {
    didChangeWatchedFiles: { dynamicRegistration: true, relativePatternSupport: true },
    diagnostics: { refreshSupport: true },
  } } });
  callbacks.get('initialized')!({});
  return {
    adapter, warnings, errors, released, registrations,
    pull: (uri: string) => callbacks.get('diagnostics')!({ textDocument: { uri } }) as Extract<DocumentDiagnosticReport, { kind: 'full' }>,
    open: (source: SourceDocument) => callbacks.get('opened')!({ textDocument: { ...source, version: 1, languageId: 'expec' } }),
  };
}

const range = (sourceId: string, start: number, end: number, line = 1, column = start + 1) => ({
  sourceId, start: { offset: start, line, column }, end: { offset: end, line, column: column + end - start },
});
const origin = (location: ReturnType<typeof range>) => ({
  kind: 'source' as const, module: location.sourceId, node: { sourceId: location.sourceId, ordinal: 0 }, range: location,
});
const emptyReport = (sources: SourceDocument[], dependencies: string[] = []): DocumentReport => ({ syntax: [], sources, dependencies });

describe('native semantic feedback at its protocol boundary', () => {
  it('translates a primary and related location with each URI’s captured scalar text', () => {
    const server = recordedServer();
    const source = { uri: 'file:///workspace/main.expec', text: '📚root' };
    const imported = { uri: 'file:///workspace/book.expec', text: 'first\n📚book' };
    server.adapter.publish(source, 1, {
      ...emptyReport([source, imported]),
      compilation: { syntax: [], deferred: [], problems: [{
        code: 'unresolved-reference', message: 'Unknown root.', at: origin(range(source.uri, 1, 5)),
        related: [origin(range(imported.uri, 7, 11, 2, 2))],
      }] },
    });
    expect(server.pull(source.uri).items).toEqual([{
      severity: 1, source: 'expec', code: 'unresolved-reference', message: 'Unknown root.',
      range: { start: { line: 0, character: 2 }, end: { line: 0, character: 6 } },
      relatedInformation: [{ message: 'Unknown root.', location: { uri: imported.uri,
        range: { start: { line: 1, character: 2 }, end: { line: 1, character: 6 } },
      } }],
    }]);
    server.adapter.dispose();
  });

  it('logs foreign, nonlocated and deferred findings without inventing editor positions', () => {
    const server = recordedServer();
    const source = { uri: 'file:///workspace/main.expec', text: 'type Main {}' };
    const imported = { uri: 'file:///workspace/book.expec', text: 'type Book {}' };
    server.adapter.publish(source, 1, {
      ...emptyReport([source, imported]),
      compilation: { syntax: [], problems: [
        { code: 'imported-failure', message: 'The imported declaration is invalid.', at: origin(range(imported.uri, 5, 9)), related: [] },
        { code: 'missing-metadata', message: 'External metadata is unavailable.', at: { kind: 'dependency', path: ['modules', 0] }, related: [] },
      ], deferred: [{ reason: 'composition', requires: 'supplied module graph', origin: { kind: 'external', module: 'external-lib', path: ['Book'] } }] },
    });
    expect(server.pull(source.uri).items).toEqual([]);
    expect(server.warnings).toHaveLength(3);
    expect(server.warnings[0]).toContain('[imported-failure] The imported declaration is invalid.');
    expect(server.warnings[0]).toContain(imported.uri);
    expect(server.warnings[1]).toContain('[missing-metadata] External metadata is unavailable.');
    expect(server.warnings[1]).toContain('"path":["modules",0]');
    expect(server.warnings[2]).toContain('Requires supplied module graph');
    expect(server.warnings[2]).toContain('external-lib');
    server.adapter.dispose();
  });

  it('gives a changed analysis a different opaque result ID at the same editor version', () => {
    const server = recordedServer();
    const source = { uri: 'file:///workspace/main.expec', text: 'type Main {}' };
    server.adapter.publish(source, 7, emptyReport([source]));
    const earlier = server.pull(source.uri);
    server.adapter.publish(source, 7, emptyReport([source]));
    const current = server.pull(source.uri);
    expect(earlier.resultId).toBeTruthy();
    expect(current.resultId).toBeTruthy();
    expect(current.resultId).not.toBe(earlier.resultId);
    server.adapter.clear(source.uri);
    expect(server.pull(source.uri)).toEqual({ kind: 'full', resultId: undefined, items: [] });
    server.adapter.dispose();
  });

  it('retains a shared exact-file watch until its final requesting report clears', async () => {
    const server = recordedServer();
    const first = { uri: 'file:///workspace/first.expec', text: '' };
    const second = { uri: 'file:///workspace/second.expec', text: '' };
    const dependency = 'file:///outside/book%5Bdraft%5D.expec';
    server.adapter.publish(first, 1, emptyReport([first], [dependency]));
    server.adapter.publish(second, 1, emptyReport([second], [dependency]));
    expect(server.registrations).toHaveLength(1);
    expect(server.registrations[0]!.options).toEqual({ watchers: [{
      globPattern: { baseUri: 'file:///outside/', pattern: 'book[[]draft[]].expec' },
    }] });
    let releases = 0;
    server.registrations[0]!.complete({ dispose: () => { releases++; } });
    await Promise.resolve();
    server.adapter.clear(first.uri);
    expect(releases).toBe(0);
    server.adapter.clear(second.uri);
    expect(releases).toBe(1);
    server.adapter.dispose();
    server.adapter.dispose();
    expect(releases).toBe(1);
  });

  it('unregisters a pending watch that completes after shutdown without reading source', async () => {
    let reads = 0;
    const server = recordedServer({ read: () => { reads++; return undefined; } });
    const source = { uri: 'file:///workspace/main.expec', text: '' };
    server.adapter.publish(source, 1, emptyReport([source], ['file:///outside/book.expec']));
    server.adapter.dispose();
    let releases = 0;
    server.registrations[0]!.complete({ dispose: () => { releases++; } });
    await Promise.resolve();
    expect(releases).toBe(1);
    expect(reads).toBe(0);
    expect(server.pull(source.uri).items).toEqual([]);
    server.adapter.dispose();
    expect(releases).toBe(1);
  });

  it('releases owned watches and reports when closing an imported lifetime cannot read its saved source', async () => {
    const failure = new Error('Saved source acquisition failed during shutdown.');
    const server = recordedServer({ read: () => { throw failure; } });
    const imported = { uri: 'file:///workspace/book.expec', text: 'type Book {}' };
    const source = { uri: 'file:///workspace/main.expec', text: 'use Book from "./book.expec"\ntype Main { book: Book }' };
    server.open(imported);
    server.open(source);
    let releases = 0;
    server.registrations[0]!.complete({ dispose: () => { releases++; } });
    await Promise.resolve();
    expect(server.pull(source.uri).resultId).toBeTruthy();
    expect(() => server.adapter.dispose()).toThrow(failure);
    expect(server.pull(source.uri).items).toEqual([]);
    expect(server.pull(source.uri).resultId).toBeUndefined();
    expect(releases).toBe(1);
    expect(new Set(server.released)).toEqual(new Set(['initialize', 'initialized', 'watched', 'diagnostics', 'opened', 'changed', 'closed', 'willSave', 'willSaveWaitUntil', 'saved']));
    expect(() => server.adapter.dispose()).not.toThrow();
  });
});