import { ExternalModel, LangiumModel, LangiumReader, QueryError, QueryInspection, SourceComposer, type Inspection, type Item } from 'executable-specification-language';
import { describe, expect, it, vi } from 'vitest';
import { DocumentAnalysis } from '../../../src/core/DocumentAnalysis.js';
import type { DocumentReport } from '../../../src/core/DocumentReport.js';
import type { SourceDocument } from '../../../src/core/SourceDocument.js';
import { SourceNavigation } from '../../../src/core/SourceNavigation.js';
import { SourceReferences } from '../../../src/core/SourceReferences.js';

const catalog = { uri: 'file:///workspace/catalog.expec', text: 'type Book {}\ntype Basket { book: Book }' };
function reportFor(source: SourceDocument, saved: SourceDocument[] = []): DocumentReport {
  let report: DocumentReport | undefined;
  const sources = new Map(saved.map(source => [source.uri, source]));
  const analysis = new DocumentAnalysis({ publish: (_source, _version, actual) => { report = actual; }, clear: () => {} },
    { localPath: () => undefined, read: uri => sources.get(uri) });
  analysis.opened(source, 1);
  if (!report) throw new Error('The real DocumentAnalysis did not publish.');
  return report;
}
function whileQuerying(inspection: Inspection, callback: () => void): Inspection {
  let pending = true;
  return new Proxy(inspection, { get(target, key) {
    const member = Reflect.get(target, key);
    if (key === 'query') return (...args: unknown[]) => {
      if (pending) { pending = false; callback(); }
      return Reflect.apply(member, target, args);
    };
    return typeof member === 'function' ? member.bind(target) : member;
  } });
}

describe('source references for their plain caller', () => {
  it('rejects invalid versions and scalar offsets without withdrawing current facts', () => {
    const references = new SourceReferences(), report = reportFor(catalog);
    references.published(catalog, 0, report);
    for (const invalid of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => references.published(catalog, invalid, { ...report, inspection: undefined })).toThrow(RangeError);
      expect(() => references.search(catalog.uri, invalid, 5, false)).toThrow(RangeError);
      expect(() => references.search(catalog.uri, 0, invalid, false)).toThrow(RangeError);
    }
    expect(references.search(catalog.uri, 0, 5, false)?.locations).toEqual([{ source: catalog, startOffset: 33, endOffset: 37 }]);
    expect(references.search(catalog.uri, 0, 9, false)).toBeUndefined();
    expect(references.search(catalog.uri, 0, catalog.text.length, false)).toBeUndefined();
    expect(references.search(catalog.uri, 0, catalog.text.length + 1, false)).toBeUndefined();
  });

  it('shares navigation preparation and makes no Inspection calls while searching', () => {
    const report = reportFor(catalog), navigation = new SourceNavigation(), references = new SourceReferences();
    const querying = vi.spyOn(report.inspection!, 'query'), reading = vi.spyOn(report.inspection!, 'read');
    try {
      navigation.published(catalog, 1, report);
      references.published(catalog, 1, report);
      references.published(catalog, 2, report);
      expect(querying.mock.calls.filter(([kind]) => kind === 'reference')).toHaveLength(1);
      const queries = querying.mock.calls.length, reads = reading.mock.calls.length;
      expect(references.search(catalog.uri, 2, 5, true)?.locations).toEqual([
        { source: catalog, startOffset: 5, endOffset: 9 }, { source: catalog, startOffset: 33, endOffset: 37 },
      ]);
      expect(references.search(catalog.uri, 2, 34, false)?.locations).toEqual([{ source: catalog, startOffset: 33, endOffset: 37 }]);
      expect(querying).toHaveBeenCalledTimes(queries);
      expect(reading).toHaveBeenCalledTimes(reads);
    } finally { querying.mockRestore(); reading.mockRestore(); }
  });

  it('returns independent sources, ranges and lists for every reply', () => {
    const references = new SourceReferences();
    references.published(catalog, 1, reportFor(catalog));
    const first = references.search(catalog.uri, 1, 5, true)!;
    const untouched = references.search(catalog.uri, 1, 5, true)!;
    first.source.text = 'changed caller';
    first.locations[0].source.text = 'changed location';
    first.locations[0].startOffset = 0;
    first.locations.length = 0;
    first.coveredUris.push('file:///invented.expec');
    first.prerequisites.push('invented requirement');
    expect(untouched).toEqual({ source: catalog, locations: [
      { source: catalog, startOffset: 5, endOffset: 9 }, { source: catalog, startOffset: 33, endOffset: 37 },
    ], coveredUris: [catalog.uri], prerequisites: [] });
    expect(references.search(catalog.uri, 1, 5, true)).toEqual(untouched);
  });

  it('withdraws old facts before genuine SDK preparation errors surface', () => {
    const references = new SourceReferences(), report = reportFor(catalog);
    references.published(catalog, 1, report);
    const foreign = reportFor({ ...catalog, uri: 'file:///workspace/foreign.expec' }).inspection!;
    const inspection = new Proxy(report.inspection!, { get(target, key) {
      if (key === 'read') return foreign.read.bind(foreign);
      const member = Reflect.get(target, key);
      return typeof member === 'function' ? member.bind(target) : member;
    } });
    expect(() => references.published(catalog, 1, { ...report, inspection })).toThrow(QueryError);
    expect(references.search(catalog.uri, 1, 5, true)).toBeUndefined();
    references.published(catalog, 1, report);
    expect(references.search(catalog.uri, 1, 5, true)?.locations).toHaveLength(2);
  });

  it('cannot let an older preparation replace a reentrant newer publication', () => {
    const references = new SourceReferences(), old = reportFor(catalog);
    references.published(catalog, 1, old);
    const changed = { ...catalog, text: 'type Magazine {}\ntype Basket { book: Magazine }' }, current = reportFor(changed);
    let withdrawn = false;
    const inspection = whileQuerying(old.inspection!, () => {
      withdrawn = references.search(catalog.uri, 1, 5, true) === undefined;
      references.published(changed, 1, current);
    });
    references.published(catalog, 1, { ...old, inspection });
    expect(withdrawn).toBe(true);
    expect(references.search(catalog.uri, 1, 5, false)).toEqual({ source: changed,
      locations: [{ source: changed, startOffset: 37, endOffset: 45 }], coveredUris: [catalog.uri], prerequisites: [] });
  });

  it.each(['close', 'dispose'] as const)('cannot restore an entry after reentrant %s during preparation', action => {
    const references = new SourceReferences(), report = reportFor(catalog);
    references.published(catalog, 1, report);
    const inspection = whileQuerying(report.inspection!, () => {
      if (action === 'close') references.closed(catalog.uri); else references.dispose();
    });
    references.published(catalog, 1, { ...report, inspection });
    expect(references.search(catalog.uri, 1, 5, true)).toBeUndefined();
  });

  it('captures every supported authored declaration, including generic parameters and fixtures', () => {
    const source = { uri: 'file:///workspace/kinds.expec', text: [
      'type Record { field: Text }', 'type Alias = Record', 'opaque type Secret',
      'component Store {\n capability read(value: Record) returns Record\n}',
      'concept Model {}', 'class Concrete {}', 'interface Shape {}',
      'function transform(input: Record) returns Record',
      'examples {\n setup seed() returns Nothing\n action add() returns Nothing\n observation count() returns Number',
      'check expectCount() { assert true }\n fixture sample: Record = {}\n check expectSample() { assert sample == sample }\n}',
      'type Box<T> { item: T }',
    ].join('\n') };
    const report = reportFor(source), references = new SourceReferences();
    expect(report.syntax).toEqual([]);
    references.published(source, 1, report);
    for (const name of ['Record', 'Alias', 'Secret', 'Store', 'field', 'read', 'value', 'Model', 'Concrete', 'Shape',
      'transform', 'input', 'seed', 'add', 'count', 'expectCount', 'sample', 'Box', 'T']) {
      const offset = name === 'T' ? source.text.indexOf('<T>') + 1 : source.text.indexOf(name);
      const actual = references.search(source.uri, 1, offset, true);
      expect(actual, name).toBeDefined();
      expect(actual!.locations.some(location => location.startOffset === offset &&
        location.endOffset === offset + name.length && location.source.text === source.text), name).toBe(true);
    }
    const generic = references.search(source.uri, 1, source.text.indexOf('<T>') + 1, false)!;
    expect(generic.locations).toEqual([{ source, startOffset: source.text.indexOf('item: T') + 6, endOffset: source.text.indexOf('item: T') + 7 }]);
    expect(references.search(source.uri, 1, source.text.indexOf('sample:'), false)?.locations).toHaveLength(2);
  });

  it('selects only the final qualified segment and never an import alias declaration', () => {
    const source = { uri: 'file:///workspace/qualified.expec', text: 'component Library {\n local type Book {}\n capability read(book: Library.Book)\n}' };
    const references = new SourceReferences();
    references.published(source, 1, reportFor(source));
    const prefix = source.text.indexOf('Library.Book');
    expect(references.search(source.uri, 1, prefix, false)).toBeUndefined();
    expect(references.search(source.uri, 1, prefix + 7, false)).toBeUndefined();
    expect(references.search(source.uri, 1, prefix + 8, false)?.locations).toEqual([
      { source, startOffset: prefix + 8, endOffset: prefix + 12 },
    ]);
    const book = { uri: 'file:///workspace/book.expec', text: 'type Book {}' };
    const entry = { uri: 'file:///workspace/entry.expec', text: 'use Book as Novel from "./book.expec"\ntype Basket { book: Novel }' };
    references.published(entry, 1, reportFor(entry, [book]));
    expect(references.search(entry.uri, 1, entry.text.indexOf('Novel'), true)).toBeUndefined();
  });

  it('refuses builtin, source-free external and uncaptured targets', () => {
    const references = new SourceReferences(), source = { ...catalog, text: 'use Book from "./external"\ntype Basket { book: Book\n title: Text }' };
    const read = new LangiumReader().read({ sourceId: source.uri, text: source.text });
    if (read.status !== 'accepted') throw new Error('The supplied external caller was rejected.');
    const external = new ExternalModel('file:///workspace/external', [{ kind: 'record-type', name: 'Book', fields: [] }]);
    const resolution = new SourceComposer((owner, authored) => new URL(authored, owner).href)
      .compose(new LangiumModel(source.uri, read.document), { modules: [external], packages: [] });
    references.published(source, 1, { syntax: [], sources: [source], dependencies: [external.locator], inspection: new QueryInspection(resolution.model) });
    expect(references.search(source.uri, 1, source.text.lastIndexOf('Book'), true)).toBeUndefined();
    expect(references.search(source.uri, 1, source.text.indexOf('Text'), true)).toBeUndefined();
    const book = { uri: 'file:///workspace/book.expec', text: 'type Book {}' };
    const entry = { ...source, text: 'use Book from "./book.expec"\ntype Basket { book: Book }' };
    const captured = reportFor(entry, [book]);
    references.published(entry, 1, captured);
    expect(references.search(entry.uri, 1, entry.text.lastIndexOf('Book'), true)?.locations).toHaveLength(3);
    references.published(entry, 1, { ...captured, sources: [entry] });
    expect(references.search(entry.uri, 1, entry.text.lastIndexOf('Book'), true)).toBeUndefined();
    references.published({ ...entry, text: entry.text + '\n' }, 1, captured);
    expect(references.search(entry.uri, 1, entry.text.lastIndexOf('Book'), true)).toBeUndefined();
  });

  it('preserves actual rejected-source explanations, compiler findings and unavailable coverage', () => {
    const source = { ...catalog, text: 'include "./bad.expec"\ninclude "./missing.expec"\ntype Book {}\ntype Basket { book: Book }' };
    const bad = { uri: 'file:///workspace/bad.expec', text: 'type Broken {' };
    const report = reportFor(source, [bad]), references = new SourceReferences();
    expect(report.syntax.length).toBeGreaterThan(0);
    expect(report.compilation?.problems.some(problem => problem.code === 'unavailable-module')).toBe(true);
    references.published(source, 1, report);
    const actual = references.search(source.uri, 1, source.text.indexOf('Book'), false)!;
    expect(actual.locations).toHaveLength(1);
    expect(actual.coveredUris).toEqual([bad.uri, source.uri]);
    expect(actual.prerequisites).toContain('Unavailable source: file:///workspace/missing.expec');
    for (const diagnostic of report.syntax)
      expect(actual.prerequisites).toContain('Rejected source: ' + bad.uri + ': ' + diagnostic.explanation);
    for (const problem of report.compilation!.problems)
      expect(actual.prerequisites).toContain(problem.code + ': ' + problem.message);
    for (const deferred of report.compilation!.deferred)
      expect(actual.prerequisites).toContain('Deferred: ' + deferred.requires);
    expect(new Set(actual.prerequisites).size).toBe(actual.prerequisites.length);
  });

  it('deduplicates actual repeated occurrences and orders captured URIs by code unit', () => {
    const source = { uri: 'file:///workspace/z.expec', text: 'use Book from "./Z.expec"\ntype Basket { book: Book }' };
    const book = { uri: 'file:///workspace/Z.expec', text: 'type Book {}\ntype Shelf { book: Book }' };
    const report = reportFor(source, [book]), references = new SourceReferences();
    const inspection = new Proxy(report.inspection!, { get(target, key) {
      const member = Reflect.get(target, key);
      if (key === 'query') return (...args: unknown[]) => {
        const actual = Array.from(Reflect.apply(member, target, args) as Iterable<Item>);
        return [...actual, ...actual];
      };
      return typeof member === 'function' ? member.bind(target) : member;
    } });
    references.published(source, 1, { ...report, inspection, sources: [...report.sources, ...report.sources] });
    expect(references.search(source.uri, 1, source.text.lastIndexOf('Book'), true)).toEqual({ source,
      locations: [
        { source: book, startOffset: 5, endOffset: 9 },
        { source: book, startOffset: 32, endOffset: 36 },
        { source, startOffset: 4, endOffset: 8 },
        { source, startOffset: 46, endOffset: 50 },
      ], coveredUris: [book.uri, source.uri], prerequisites: [] });
  });

  it('refuses a current target with an unsafe authored name range', () => {
    const report = reportFor(catalog), references = new SourceReferences();
    references.published(catalog, 1, report);
    const inspection = new Proxy(report.inspection!, { get(target, key) {
      const member = Reflect.get(target, key);
      if (key === 'query') return (...args: unknown[]) => Array.from(Reflect.apply(member, target, args) as Iterable<Item>).map(item => {
        if (item.kind !== 'record-type-declaration' || item.name !== 'Book' || item.nameOrigin.kind !== 'source') return item;
        return { ...item, nameOrigin: { ...item.nameOrigin, range: { ...item.nameOrigin.range,
          end: { ...item.nameOrigin.range.end, offset: Number.POSITIVE_INFINITY } } } };
      });
      return typeof member === 'function' ? member.bind(target) : member;
    } });
    references.published(catalog, 1, { ...report, inspection });
    expect(references.search(catalog.uri, 1, 5, true)).toBeUndefined();
    expect(references.search(catalog.uri, 1, 34, true)).toBeUndefined();
  });
  it('closes only one document and begins a lower-version lifetime after reopening', () => {
    const references = new SourceReferences(), other = { ...catalog, uri: 'file:///workspace/other.expec' };
    references.published(catalog, 10, reportFor(catalog));
    references.published(other, 1, reportFor(other));
    references.closed(catalog.uri); references.closed(catalog.uri);
    expect(references.search(catalog.uri, 10, 5, false)).toBeUndefined();
    expect(references.search(other.uri, 1, 5, false)?.locations).toHaveLength(1);
    references.published(catalog, 0, reportFor(catalog));
    expect(references.search(catalog.uri, 0, 5, false)?.locations).toHaveLength(1);
    references.dispose(); references.dispose();
    references.published(catalog, 1, reportFor(catalog));
    expect(references.search(catalog.uri, 1, 5, false)).toBeUndefined();
    expect(references.search(other.uri, 1, 5, false)).toBeUndefined();
  });
});
