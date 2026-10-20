import { describe, expect, it } from 'vitest';
import { SourceRename } from '../../../src/core/SourceRename.js';
import type { ConnectionConfiguration } from '../../../src/core/ConnectionConfiguration.js';
import type { RenameBuffer } from '../../../src/core/RenameBuffer.js';
import type { SourceDocument } from '../../../src/core/SourceDocument.js';

const bookUri = 'file:///workspace/book.expec';
const basketUri = 'file:///workspace/basket.expec';

/** Mutable host facts only; the public renamer owns all reading and checking. */
function configuredRename(text: string, settings: Record<string, unknown> = {}) {
  const source = { uri: bookUri, text };
  const state = {
    configuration: { file: 'file:///workspace/expec.json', text: JSON.stringify({ formatVersion: 1, version: '0.1.0',
      build: { entries: ['book.expec'] }, outputs: [], ...settings }), writable: false } as ConnectionConfiguration,
    buffers: new Map<string, RenameBuffer>([[bookUri, { source, version: 1 }]]),
    saved: new Map<string, SourceDocument>(),
    paths: new Map([[bookUri, 'book.expec'], [basketUri, 'basket.expec']]),
    identities: new Map<string, string>([
      [bookUri, 'fixture-book'], [basketUri, 'fixture-basket'],
      ['file:///workspace/%62ook.expec', 'fixture-book'],
      ['file:///workspace/other.expec', 'fixture-other'],
    ]),
    identifying: undefined as ((uri: string) => void) | undefined,
    reading: undefined as ((uri: string) => void) | undefined,
    locating: undefined as ((uri: string) => void) | undefined,
  };
  const renamer = new SourceRename({ configuration: () => ({ ...state.configuration }),
    openDocuments: () => [...state.buffers.values()].map(buffer => ({ source: { ...buffer.source }, version: buffer.version })) },
  { read: uri => { state.reading?.(uri); const source = state.saved.get(uri); return source && { ...source }; },
    localPath: uri => { state.locating?.(uri); return state.paths.get(uri); } },
  { keyOf: uri => { state.identifying?.(uri); return state.identities.get(uri); } });
  return { renamer, source, state };
}

describe('safe rename for its plain caller', () => {
  it('refuses an acquired source without a verified requirement path instead of assuming an encoded route is independent', () => {
    const encodedBookUri = 'file:///workspace/%62ook.expec';
    const otherUri = 'file:///workspace/other.expec';
    const basket = { uri: basketUri, text: 'use Book from "./book.expec"\ntype Basket { book: Book }' };
    const { renamer, state } = configuredRename('type Book {}', { build: { entries: ['basket.expec', 'other.expec'] } });
    state.buffers.clear();
    state.buffers.set(basketUri, { source: basket, version: 3 });
    state.saved.set(bookUri, { uri: bookUri, text: 'type Book {}' });
    state.saved.set(encodedBookUri, { uri: encodedBookUri, text: 'type Book {}' });
    state.saved.set(otherUri, { uri: otherUri, text: 'use Book from "./%62ook.expec"\ntype Shelf { book: Book }' });
    state.paths.set(otherUri, 'other.expec');
    expect(() => renamer.rename(basketUri, 3, 4, 'Publication')).toThrow(encodedBookUri);
    expect(state.saved.get(bookUri)?.text).toBe('type Book {}');
    expect(state.saved.get(encodedBookUri)?.text).toBe('type Book {}');
    expect(state.buffers.get(basketUri)).toEqual({ source: basket, version: 3 });
  });

  it('ignores an unrelated uncaptured foreign open source whose primary path is unavailable', () => {
    const foreign = { uri: 'file:///foreign/notes.expec', text: 'unrelated unsaved text that is not valid .expec' };
    const { renamer, source, state } = configuredRename('type Book {}');
    state.buffers.set(foreign.uri, { source: foreign, version: 9 });
    expect(renamer.rename(bookUri, 1, 5, 'Publication')).toEqual([{ source, version: 1,
      edits: [{ startOffset: 5, endOffset: 9, newText: 'Publication' }] }]);
    expect(state.buffers.get(foreign.uri)).toEqual({ source: foreign, version: 9 });
  });

  it('refuses distinct saved source identities sharing one verified path instead of returning a partial physical-file edit', () => {
    const encodedBookUri = 'file:///workspace/%62ook.expec';
    const otherUri = 'file:///workspace/other.expec';
    const basket = { uri: basketUri, text: 'use Book from "./book.expec"\ntype Basket { book: Book }' };
    const { renamer, state } = configuredRename('type Book {}', { build: { entries: ['basket.expec', 'other.expec'] } });
    state.buffers.clear();
    state.buffers.set(basketUri, { source: basket, version: 3 });
    state.saved.set(bookUri, { uri: bookUri, text: 'type Book {}' });
    state.saved.set(encodedBookUri, { uri: encodedBookUri, text: 'type Book {}' });
    state.saved.set(otherUri, { uri: otherUri, text: 'use Book from "./%62ook.expec"\ntype Shelf { book: Book }' });
    state.paths.set(encodedBookUri, 'book.expec');
    state.paths.set(otherUri, 'other.expec');
    expect(() => renamer.rename(basketUri, 3, 4, 'Publication')).toThrow(/identity|routing/i);
    expect(state.buffers.get(basketUri)).toEqual({ source: basket, version: 3 });
    expect(state.saved.get(bookUri)?.text).toBe('type Book {}');
    expect(state.saved.get(encodedBookUri)?.text).toBe('type Book {}');
    expect(state.saved.get(otherUri)?.text).toBe('use Book from "./%62ook.expec"\ntype Shelf { book: Book }');
  });

  it('uses an open source through its verified configured path while preserving its exact URI and version', () => {
    const encodedUri = 'file:///workspace/%62ook.expec';
    const openSource = { uri: encodedUri, text: '// unsaved 📚\ntype Book {}' };
    const { renamer, state } = configuredRename('type Book {}');
    const savedSource = { uri: bookUri, text: 'type Book {}' };
    state.saved.set(bookUri, savedSource);
    state.buffers.clear();
    state.buffers.set(encodedUri, { source: openSource, version: 7 });
    state.paths.set(encodedUri, 'book.expec');
    expect(renamer.prepare(encodedUri, 7, 18)).toEqual({ name: 'Book', location: {
      source: openSource, startOffset: 18, endOffset: 22,
    } });
    expect(renamer.rename(encodedUri, 7, 18, 'Publication')).toEqual([{ source: openSource, version: 7,
      edits: [{ startOffset: 18, endOffset: 22, newText: 'Publication' }] }]);
    expect(state.saved.get(bookUri)).toEqual(savedSource);
    expect(state.buffers.get(encodedUri)).toEqual({ source: openSource, version: 7 });
  });

  it('refuses two open identities with the same verified path instead of choosing a buffer version', () => {
    const encodedUri = 'file:///workspace/%62ook.expec';
    const { renamer, state } = configuredRename('type Book {}');
    state.buffers.set(encodedUri, { source: { uri: encodedUri, text: 'type Magazine {}' }, version: 7 });
    state.paths.set(encodedUri, 'book.expec');
    expect(() => renamer.rename(bookUri, 1, 5, 'Publication')).toThrow(/ambiguous|identity/i);
  });

  it('refuses an explicit import alias introduction and an alias use as source declaration rename targets', () => {
    const text = 'use Book as Novel from "./basket.expec"\ntype Shelf { book: Novel }';
    const { renamer, state } = configuredRename(text);
    state.saved.set(basketUri, { uri: basketUri, text: 'type Book {}' });
    expect(() => renamer.prepare(bookUri, 1, text.indexOf('Novel'))).toThrow(/alias/);
    expect(() => renamer.rename(bookUri, 1, text.lastIndexOf('Novel'), 'Publication')).toThrow(/alias/);
  });

  it('refuses a qualified prefix and a declaration whose qualified uses cannot be safely routed', () => {
    const text = 'component Store { public save\ncapability save() returns Nothing }\nexamples for Store.save {}';
    const { renamer } = configuredRename(text);
    expect(() => renamer.prepare(bookUri, 1, text.lastIndexOf('Store.save'))).toThrow(/prefix/);
    expect(() => renamer.rename(bookUri, 1, text.indexOf('Store'), 'Library')).toThrow(/prefix/);
  });

  it('returns no changes for an unchanged decoded name after checking the actual source', () => {
    const { renamer, source } = configuredRename('type `Book` {}\ntype Shelf { book: Book }');
    expect(renamer.prepare(bookUri, 1, 5)).toEqual({ name: 'Book', location: { source, startOffset: 5, endOffset: 11 } });
    expect(renamer.rename(bookUri, 1, 5, 'Book')).toEqual([]);
  });

  it('uses scalar positions with a paired Unicode character before the selected name', () => {
    const { renamer, source } = configuredRename('//📚\ntype Book {}');
    expect(renamer.prepare(bookUri, 1, 9)).toEqual({ name: 'Book', location: { source, startOffset: 9, endOffset: 13 } });
    expect(renamer.rename(bookUri, 1, 9, 'Library 📚')[0].edits).toEqual([{ startOffset: 9, endOffset: 13, newText: '`Library 📚`' }]);
  });

  it('quotes literal backticks and backslashes through the actual language reader', () => {
    const { renamer } = configuredRename('type Book {}\ntype Shelf { book: Book }');
    const edits = renamer.rename(bookUri, 1, 5, 'New`\\Name')[0].edits;
    expect(edits.map(edit => edit.newText)).toEqual(['`New\\`\\\\Name`', '`New\\`\\\\Name`']);
  });

  it('keeps a declaration-shaped new name inside one quoted token', () => {
    const { renamer, source } = configuredRename('type Book {}');
    expect(renamer.rename(bookUri, 1, 5, 'Publication {} type Extra')).toEqual([{ source, version: 1,
      edits: [{ startOffset: 5, endOffset: 9, newText: '`Publication {} type Extra`' }] }]);
  });

  it('refuses a control character without treating the new name as source syntax', () => {
    const { renamer } = configuredRename('type Book {}');
    expect(() => renamer.rename(bookUri, 1, 5, 'New\nName')).toThrow(/control/);
  });

  it('refuses an unpaired surrogate instead of normalizing its spelling', () => {
    const { renamer } = configuredRename('type Book {}');
    expect(() => renamer.rename(bookUri, 1, 5, 'New\ud800Name')).toThrow(/surrogate/);
  });

  it('rejects invalid request coordinates and an obsolete open version', () => {
    const { renamer } = configuredRename('type Book {}');
    expect(() => renamer.prepare(bookUri, -1, 5)).toThrow(RangeError);
    expect(() => renamer.rename(bookUri, 1, 5.5, 'Publication')).toThrow(RangeError);
    expect(() => renamer.prepare(bookUri, 1, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => renamer.rename(bookUri, 2, 5, 'Publication')).toThrow(/current open version/);
  });

  it('refuses a selected configuration changed by the source ownership provider', () => {
    const { renamer, state } = configuredRename('type Book {}');
    state.locating = () => { state.configuration = { ...state.configuration, writable: true }; };
    expect(() => renamer.rename(bookUri, 1, 5, 'Publication')).toThrow(/changed/);
  });

  it('freshly rereads a saved-only source before returning its edit', () => {
    const { renamer, state } = configuredRename('type Book {}', { build: { entries: ['book.expec', 'basket.expec'] } });
    state.saved.set(basketUri, { uri: basketUri, text: 'use Book from "./book.expec"\ntype Basket { book: Book }' });
    let reads = 0;
    state.reading = uri => {
      if (uri === basketUri && ++reads === 2) state.saved.set(basketUri, { uri: basketUri, text: 'type Basket {}' });
    };
    expect(() => renamer.rename(bookUri, 1, 5, 'Publication')).toThrow('Saved rename input changed: ' + basketUri);
    expect(reads).toBe(2);
  });

  it('retains actual scoped-package alias and phase validation from the selected manifest', () => {
    const missing = configuredRename('type Book {}', { requirements: { project: { runtime: ['react'] } } });
    expect(() => missing.renamer.prepare(bookUri, 1, 5)).toThrow('Unknown package alias react');
    const wrongPhase = configuredRename('type Book {}', { packages: [{ alias: 'react', name: 'react', version: '1.0.0', phases: ['build'] }],
      requirements: { files: [{ path: 'book.expec', runtime: ['react'] }] } });
    expect(() => wrongPhase.renamer.rename(bookUri, 1, 5, 'Publication')).toThrow('does not declare the runtime phase');
  });

  it('passes supplied package phases to real compilation without requiring a generated-output connection', () => {
    const text = 'component Store {\n requires package "react" for runtime\n}\ntype Book {}';
    const { renamer, source } = configuredRename(text, { packages: [{ alias: 'react', name: 'react', version: '1.0.0', phases: ['runtime'] }],
      requirements: { project: { runtime: ['react'] } } });
    const offset = text.indexOf('Book');
    expect(renamer.rename(bookUri, 1, offset, 'Publication')).toEqual([{ source, version: 1,
      edits: [{ startOffset: offset, endOffset: offset + 4, newText: 'Publication' }] }]);
  });

  it('returns caller-isolated edit plans without changing host sources or later answers', () => {
    const { renamer, source, state } = configuredRename('type Book {}\ntype Shelf { book: Book }');
    const original = renamer.rename(bookUri, 1, 5, 'Publication');
    const changed = renamer.rename(bookUri, 1, 5, 'Publication');
    changed[0].source.text = 'caller mutation';
    changed[0].edits[0].newText = 'wrong';
    changed[0].edits.length = 0;
    expect(renamer.rename(bookUri, 1, 5, 'Publication')).toEqual(original);
    expect(state.buffers.get(bookUri)?.source).toEqual(source);
    expect(source.text).toBe('type Book {}\ntype Shelf { book: Book }');
  });

  it('rechecks a resolved alias route after saved-only reads even when its exact open buffer remains unchanged', () => {
    const encodedUri = 'file:///workspace/%62ook.expec';
    const openSource = { uri: encodedUri, text: 'type Book {}' };
    const { renamer, state } = configuredRename('type Book {}', { build: { entries: ['basket.expec'] } });
    state.buffers.clear();
    state.buffers.set(encodedUri, { source: openSource, version: 7 });
    state.saved.set(basketUri, { uri: basketUri, text: 'use Book from "./book.expec"\ntype Basket { book: Book }' });
    state.paths.set(encodedUri, 'book.expec');
    state.identities.set(encodedUri, 'fixture-book');
    let reads = 0;
    state.reading = uri => {
      if (uri === basketUri && ++reads === 2) state.identities.set(bookUri, 'replacement-book');
    };
    expect(() => renamer.rename(encodedUri, 7, 5, 'Publication')).toThrow('Rename source identity changed: ' + bookUri);
    expect(reads).toBe(2);
    expect(state.buffers.get(encodedUri)).toEqual({ source: openSource, version: 7 });
    expect(state.saved.get(basketUri)?.text).toBe('use Book from "./book.expec"\ntype Basket { book: Book }');
  });

  it('refuses an open buffer at the same verified path when physical identity facts disagree', () => {
    const encodedUri = 'file:///workspace/%62ook.expec';
    const openSource = { uri: encodedUri, text: 'type Book {}' };
    const { renamer, state } = configuredRename('type Book {}');
    state.buffers.clear();
    state.buffers.set(encodedUri, { source: openSource, version: 7 });
    state.saved.set(bookUri, { uri: bookUri, text: 'type Book {}' });
    state.paths.set(encodedUri, 'book.expec');
    state.identities.set(encodedUri, 'different-physical-book');
    expect(() => renamer.rename(encodedUri, 7, 5, 'Publication')).toThrow(/identity/);
    expect(state.buffers.get(encodedUri)).toEqual({ source: openSource, version: 7 });
    expect(state.saved.get(bookUri)?.text).toBe('type Book {}');
  });

  it('refuses different captured requirement paths that identify the same physical file', () => {
    const secondUri = 'file:///workspace/second.expec';
    const otherUri = 'file:///workspace/other.expec';
    const basket = { uri: basketUri, text: 'use Book from "./book.expec"\ntype Basket { book: Book }' };
    const { renamer, state } = configuredRename('type Book {}', { build: { entries: ['basket.expec', 'other.expec'] } });
    state.buffers.clear();
    state.buffers.set(basketUri, { source: basket, version: 3 });
    state.saved.set(bookUri, { uri: bookUri, text: 'type Book {}' });
    state.saved.set(secondUri, { uri: secondUri, text: 'type Book {}' });
    state.saved.set(otherUri, { uri: otherUri, text: 'use Book from "./second.expec"\ntype Shelf { book: Book }' });
    state.paths.set(secondUri, 'second.expec');
    state.paths.set(otherUri, 'other.expec');
    state.identities.set(secondUri, 'fixture-book');
    state.identities.set(otherUri, 'physical-other');
    expect(() => renamer.rename(basketUri, 3, 4, 'Publication')).toThrow(/identity/);
    expect(state.buffers.get(basketUri)).toEqual({ source: basket, version: 3 });
    expect(state.saved.get(bookUri)?.text).toBe('type Book {}');
    expect(state.saved.get(secondUri)?.text).toBe('type Book {}');
    expect(state.saved.get(otherUri)?.text).toBe('use Book from "./second.expec"\ntype Shelf { book: Book }');
  });

  it('requires physical identity for the requesting source despite its verified primary path', () => {
    const { renamer, source, state } = configuredRename('type Book {}');
    state.identities.delete(bookUri);
    expect(() => renamer.rename(bookUri, 1, 5, 'Publication')).toThrow(bookUri);
    expect(state.buffers.get(bookUri)).toEqual({ source, version: 1 });
  });

  it('requires physical identity for every acquired saved-only configured source', () => {
    const basket = { uri: basketUri, text: 'use Book from "./book.expec"\ntype Basket { book: Book }' };
    const { renamer, source, state } = configuredRename('type Book {}', { build: { entries: ['book.expec', 'basket.expec'] } });
    state.saved.set(basketUri, basket);
    state.identities.delete(basketUri);
    expect(() => renamer.rename(bookUri, 1, 5, 'Publication')).toThrow(basketUri);
    expect(state.saved.get(basketUri)).toEqual(basket);
    expect(state.buffers.get(bookUri)).toEqual({ source, version: 1 });
  });

  it('refuses a configuration changed by the final physical identity callback', () => {
    const { renamer, source, state } = configuredRename('type Book {}');
    let observations = 0;
    state.identifying = uri => {
      if (uri === bookUri && ++observations === 2) state.configuration = { ...state.configuration, writable: true };
    };
    expect(() => renamer.rename(bookUri, 1, 5, 'Publication')).toThrow(/changed/);
    expect(observations).toBe(2);
    expect(state.buffers.get(bookUri)).toEqual({ source, version: 1 });
  });

  it('refuses an open document replaced by the final physical identity callback', () => {
    const { renamer, state } = configuredRename('type Book {}');
    const replacement = { source: { uri: bookUri, text: 'type Magazine {}' }, version: 2 };
    let observations = 0;
    state.identifying = uri => {
      if (uri === bookUri && ++observations === 2) state.buffers.set(bookUri, replacement);
    };
    expect(() => renamer.rename(bookUri, 1, 5, 'Publication')).toThrow(/changed/);
    expect(observations).toBe(2);
    expect(state.buffers.get(bookUri)).toEqual(replacement);
  });

  it('keeps differently cased requirement paths independent when the host proves different physical files', () => {
    const uppercaseUri = 'file:///workspace/Book.expec';
    const otherUri = 'file:///workspace/other.expec';
    const basket = { uri: basketUri, text: 'use Book from "./book.expec"\ntype Basket { book: Book }' };
    const book = { uri: bookUri, text: 'type Book {}' };
    const uppercase = { uri: uppercaseUri, text: 'type Book {}' };
    const other = { uri: otherUri, text: 'use Book from "./Book.expec"\ntype Shelf { book: Book }' };
    const { renamer, state } = configuredRename('type Book {}', { build: { entries: ['basket.expec', 'other.expec'] } });
    state.buffers.clear();
    state.buffers.set(basketUri, { source: basket, version: 3 });
    state.saved.set(bookUri, book);
    state.saved.set(uppercaseUri, uppercase);
    state.saved.set(otherUri, other);
    state.paths.set(uppercaseUri, 'Book.expec');
    state.paths.set(otherUri, 'other.expec');
    state.identities.set(uppercaseUri, 'physical-uppercase-book');
    state.identities.set(otherUri, 'physical-other');
    expect(renamer.rename(basketUri, 3, 4, 'Publication')).toEqual([
      { source: basket, version: 3, edits: [{ startOffset: 49, endOffset: 53, newText: 'Publication' },
        { startOffset: 4, endOffset: 8, newText: 'Publication' }] },
      { source: book, edits: [{ startOffset: 5, endOffset: 9, newText: 'Publication' }] },
    ]);
    expect(state.saved.get(uppercaseUri)).toEqual(uppercase);
    expect(state.saved.get(otherUri)).toEqual(other);
    expect(state.buffers.get(basketUri)).toEqual({ source: basket, version: 3 });
  });
});
