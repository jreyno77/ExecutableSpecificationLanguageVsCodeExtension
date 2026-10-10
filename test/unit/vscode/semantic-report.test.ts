import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Connection, Disposable, DocumentDiagnosticReport } from 'vscode-languageserver/node';
import { CancellationToken, CancellationTokenSource } from 'vscode-languageserver/node';
import { LanguageServerAdapter } from '../../../src/vscode/LanguageServerAdapter.js';
import type { DocumentSources } from '../../../src/core/DocumentSources.js';
import type { DocumentReport } from '../../../src/core/DocumentReport.js';
import type { PreviewPublication } from '../../../src/core/PreviewPublication.js';
import type { SourceDocument } from '../../../src/core/SourceDocument.js';

// A narrow native-connection recorder: the real adapter registers and invokes these
// protocol operations. It never parses source or supplies an expected compiler answer.
function recordedServer(sources: DocumentSources = { read: () => undefined }) {
  const callbacks = new Map<string, (params: any, token?: CancellationToken) => any>();
  const listenerCounts = new Map<string, number>();
  const released: string[] = [], warnings: string[] = [], errors: string[] = [];
  const publications: PreviewPublication[] = [], publicationListeners = new Set<() => void>();
  const registrations: Array<{ options: unknown; complete: (registration: Disposable) => void }> = [];
  const listen = (name: string) => (callback: (params: any) => any) => {
    listenerCounts.set(name, (listenerCounts.get(name) ?? 0) + 1);
    callbacks.set(name, callback);
    return { dispose: () => { released.push(name); } };
  };
  const connection = {
    onInitialize: listen('initialize'), onInitialized: listen('initialized'), onDefinition: listen('definition'), onHover: listen('hover'),
    onNotification: (method: string, callback: (params: any) => void) => listen(method)(callback),
    sendNotification: (_method: string, value: PreviewPublication) => { publications.push(value); for (const receive of [...publicationListeners]) receive(); return Promise.resolve(); },
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
  const initialization = callbacks.get('initialize')!({ capabilities: { workspace: {
    didChangeWatchedFiles: { dynamicRegistration: true, relativePatternSupport: true },
    diagnostics: { refreshSupport: true },
  } } });
  callbacks.get('initialized')!({});
  return {
    adapter, warnings, errors, released, registrations, publications, initialization,
    listenerCount: (name: string) => listenerCounts.get(name) ?? 0,
    notification: (method: string, value: unknown) => { const receive = callbacks.get(method); if (!receive) throw Error('No registered notification ' + method); receive(value); },
    waitPreview: (matches: (publication: PreviewPublication) => boolean) => new Promise<void>(resolve => { const receive = () => { if (publications.some(matches)) { publicationListeners.delete(receive); resolve(); } }; publicationListeners.add(receive); receive(); }),
    pull: (uri: string) => callbacks.get('diagnostics')!({ textDocument: { uri } }) as Extract<DocumentDiagnosticReport, { kind: 'full' }>,
    open: (source: SourceDocument) => callbacks.get('opened')!({ textDocument: { ...source, version: 1, languageId: 'expec' } }),
    change: (source: SourceDocument, version: number) => callbacks.get('changed')!({ textDocument: { uri: source.uri, version }, contentChanges: [{ text: source.text }] }),
    close: (uri: string) => callbacks.get('closed')!({ textDocument: { uri } }),
    definition: async (uri: string, line: number, character: number, token = CancellationToken.None) => {
      const handler = callbacks.get('definition');
      if (!handler) throw new Error('No registered textDocument/definition handler.');
      return (await handler({ textDocument: { uri }, position: { line, character } }, token)) ?? null;
    },
    hover: async (uri: string, line: number, character: number, token = CancellationToken.None) => {
      const handler = callbacks.get('hover');
      if (!handler) throw new Error('No registered textDocument/hover handler.');
      return (await handler({ textDocument: { uri }, position: { line, character } }, token)) ?? null;
    },
  };
}

const range = (sourceId: string, start: number, end: number, line = 1, column = start + 1) => ({
  sourceId, start: { offset: start, line, column }, end: { offset: end, line, column: column + end - start },
});

describe('native source hovers at their protocol boundary', () => {
  it('advertises one standard hover provider and releases its registration once', () => {
    const server = recordedServer();
    try {
      expect(server.initialization.capabilities.hoverProvider).toBe(true);
      expect(server.listenerCount('hover')).toBe(1);
      server.adapter.start(); expect(server.listenerCount('hover')).toBe(1);
      server.adapter.dispose(); server.adapter.dispose();
      expect(server.released.filter(name => name === 'hover')).toEqual(['hover']);
    } finally { server.adapter.dispose(); }
  });

  it('forwards a changed imported callable at the same entry version from the actual analysis', async () => {
    const imported = { uri: 'file:///workspace/book.expec', text: 'function publish(title: Text) returns Boolean { promises "Publish the title." }' };
    const server = recordedServer({ read: uri => uri === imported.uri ? imported : undefined });
    const entry = { uri: 'file:///workspace/client.expec', text: 'use publish from "./book.expec"\nexamples for publish {}' };
    try {
      server.open(entry);
      const before = server.pull(entry.uri).resultId;
      expect(await server.hover(entry.uri, 1, 14)).toEqual({
        contents: { kind: 'markdown', value: '```expec\nfunction publish(title: Text) returns Boolean\n```\n\nPublish the title.' },
        range: { start: { line: 1, character: 13 }, end: { line: 1, character: 20 } },
      });
      server.open({ ...imported, text: 'function publish(title: Text, copies: Number = 1) returns Text { promises "Publish current unsaved copies." }' });
      expect(server.pull(entry.uri).resultId).not.toBe(before);
      expect(await server.hover(entry.uri, 1, 14)).toEqual({
        contents: { kind: 'markdown', value: '```expec\nfunction publish(title: Text, copies: Number = 1) returns Text\n```\n\nPublish current unsaved copies.' },
        range: { start: { line: 1, character: 13 }, end: { line: 1, character: 20 } },
      });
    } finally { server.adapter.dispose(); }
  });

  it('withdraws current hovers after rejection close cancellation and disposal', async () => {
    const server = recordedServer(), cancellation = new CancellationTokenSource();
    const source = { uri: 'file:///workspace/catalog.expec', text: 'type Book { title: Text }\ntype Basket { book: Book }' };
    const actual = { contents: { kind: 'markdown', value: '```expec\ntype Book\n```' },
      range: { start: { line: 1, character: 20 }, end: { line: 1, character: 24 } } };
    try {
      server.open(source); expect(await server.hover(source.uri, 1, 21)).toEqual(actual);
      server.change({ ...source, text: 'type Book { title: Text }\ntype Basket { book: Book ' }, 2);
      expect(await server.hover(source.uri, 1, 21)).toBeNull();
      server.change(source, 3); expect(await server.hover(source.uri, 1, 21)).toEqual(actual);
      cancellation.cancel(); expect(await server.hover(source.uri, 1, 21, cancellation.token)).toBeNull();
      expect(await server.hover('file:///workspace/missing.expec', 1, 21)).toBeNull();
      server.close(source.uri); expect(await server.hover(source.uri, 1, 21)).toBeNull();
      server.adapter.dispose(); expect(await server.hover(source.uri, 1, 21)).toBeNull();
    } finally { cancellation.dispose(); server.adapter.dispose(); }
  });
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
    expect(new Set(server.released)).toEqual(new Set(['initialize', 'initialized', 'watched', 'diagnostics', 'opened', 'changed', 'closed', 'willSave', 'willSaveWaitUntil', 'saved', 'expec/previewConfiguration', 'expec/previewSelection', 'definition', 'hover']));
    expect(() => server.adapter.dispose()).not.toThrow();
  });
});

describe('native preview adaptation', () => {
  it('forwards actual open analysis into plain renderer feedback without replacing diagnostics', async () => {
    const server = recordedServer();
    const source = { uri: 'file:///workspace/book.expec', text: 'type Book { title: Text }' };
    server.notification('expec/previewConfiguration', { configuration: { file: resolve('expec.json'), writable: true, text: JSON.stringify({ formatVersion: 1, version: '0.1.0', build: { entries: ['book.expec'] }, outputs: [{ id: 'markdown', options: { directory: 'draft/docs' } }] }) } });
    server.notification('expec/previewSelection', { uri: source.uri });
    server.open(source);
    await server.waitPreview(publication => Boolean(publication.uri === source.uri && publication.tabs[0] && publication.tabs[0].status !== 'pending'));
    const actual = server.publications.at(-1)!;
    expect(actual.tabs[0]!.status, JSON.stringify(actual)).toBe('ready');
    expect(actual.uri).toBe(source.uri);
    expect(actual.version).toBe(1);
    expect(actual.tabs.map(tab => tab.id)).toEqual(['markdown']);
    expect(actual.tabs[0]!.documents![0]!.path).toBe('draft/docs/Book.md');
    expect(actual.tabs[0]!.documents![0]!.content).toContain('type Book');
    expect(JSON.parse(JSON.stringify(actual))).toEqual(actual);
    expect(actual).not.toHaveProperty('compilation');
    expect(actual).not.toHaveProperty('specification');
    expect(server.pull(source.uri).items).toEqual([]);
    server.adapter.clear(source.uri);
    expect(server.publications.at(-1)!.tabs).toEqual([]);
    const count = server.publications.length;
    server.adapter.dispose();
    server.adapter.publish(source, 2, emptyReport([source]));
    expect(server.publications).toHaveLength(count);
  });
});

describe('native source definitions at their protocol boundary', () => {
  it('advertises one standard definition provider and releases its one registration', () => {
    const server = recordedServer();
    try {
      expect(server.initialization.capabilities.definitionProvider).toBe(true);
      expect(server.listenerCount('definition')).toBe(1);
      server.adapter.start();
      expect(server.listenerCount('definition')).toBe(1);
      server.adapter.dispose(); server.adapter.dispose();
      expect(server.released.filter(name => name === 'definition')).toEqual(['definition']);
    } finally { server.adapter.dispose(); }
  });

  it('uses the real current document and withdraws its definition after rejection and close', async () => {
    const server = recordedServer();
    const source = { uri: 'file:///workspace/catalog.expec', text: 'type Book { title: Text }\ntype Basket { book: Book }' };
    try {
      server.open(source);
      expect(await server.definition(source.uri, 1, 20)).toEqual({ uri: source.uri,
        range: { start: { line: 0, character: 5 }, end: { line: 0, character: 9 } } });
      server.change({ ...source, text: 'type Magazine { title: Text }\ntype Basket { book: Magazine }' }, 2);
      expect(await server.definition(source.uri, 1, 20)).toEqual({ uri: source.uri,
        range: { start: { line: 0, character: 5 }, end: { line: 0, character: 13 } } });
      server.change({ ...source, text: 'type Magazine { title: Text }\ntype Basket { book: Magazine ' }, 3);
      expect(await server.definition(source.uri, 1, 20)).toBeNull();
      server.change(source, 4);
      expect(await server.definition(source.uri, 1, 20)).toEqual({ uri: source.uri,
        range: { start: { line: 0, character: 5 }, end: { line: 0, character: 9 } } });
      server.close(source.uri);
      expect(await server.definition(source.uri, 1, 20)).toBeNull();
    } finally { server.adapter.dispose(); }
  });

  it('returns no location for cancelled unavailable or disposed requests', async () => {
    const server = recordedServer();
    const source = { uri: 'file:///workspace/catalog.expec', text: 'type Book { title: Text }\ntype Basket { book: Book }' };
    const cancellation = new CancellationTokenSource();
    try {
      server.open(source);
      expect(await server.definition(source.uri, 1, 20)).toEqual({ uri: source.uri,
        range: { start: { line: 0, character: 5 }, end: { line: 0, character: 9 } } });
      cancellation.cancel();
      expect(await server.definition(source.uri, 1, 20, cancellation.token)).toBeNull();
      expect(await server.definition('file:///workspace/unopened.expec', 1, 20)).toBeNull();
      server.adapter.dispose();
      expect(await server.definition(source.uri, 1, 20)).toBeNull();
    } finally { cancellation.dispose(); server.adapter.dispose(); }
  });
});
