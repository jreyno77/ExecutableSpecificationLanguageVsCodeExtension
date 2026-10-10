import { ExternalModel, LangiumModel, LangiumReader, QueryInspection, SourceComposer } from 'executable-specification-language';
import { describe, expect, it, vi } from 'vitest';
import { DocumentAnalysis } from '../../../src/core/DocumentAnalysis.js';
import type { DocumentReport } from '../../../src/core/DocumentReport.js';
import type { SourceDocument } from '../../../src/core/SourceDocument.js';
import { SourceHover } from '../../../src/core/SourceHover.js';
import { SourceNavigation } from '../../../src/core/SourceNavigation.js';

const catalog = { uri: 'file:///workspace/catalog.expec', text: 'type Book { title: Text }\ntype Basket { book: Book }' };
function reportFor(source: SourceDocument, saved: SourceDocument[] = []): DocumentReport {
  let report: DocumentReport | undefined;
  const sources = new Map(saved.map(source => [source.uri, source]));
  const analysis = new DocumentAnalysis({ publish: (_source, _version, actual) => { report = actual; }, clear: () => {} },
    { read: uri => sources.get(uri) });
  analysis.opened(source, 1);
  if (!report) throw new Error('The real DocumentAnalysis did not publish a report.');
  return report;
}

describe('declaration hover for its plain caller', () => {
  it('rejects invalid versions and offsets without replacing the current reply', () => {
    const hover = new SourceHover(), report = reportFor(catalog);
    hover.published(catalog, 0, report);
    for (const invalid of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => hover.published(catalog, invalid, { ...report, inspection: undefined })).toThrow(RangeError);
      expect(() => hover.hover(catalog.uri, invalid, 46)).toThrow(RangeError);
      expect(() => hover.hover(catalog.uri, 0, invalid)).toThrow(RangeError);
    }
    expect(hover.hover(catalog.uri, 0, 46)).toEqual({ source: catalog, startOffset: 46, endOffset: 50,
      signature: 'type Book', description: '' });
    expect(hover.hover(catalog.uri, 0, 50)).toBeUndefined();
    expect(hover.hover(catalog.uri, 0, catalog.text.length)).toBeUndefined();
  });

  it('shares actual bound reference preparation with navigation and performs no request-time queries', () => {
    const report = reportFor(catalog), navigation = new SourceNavigation(), hover = new SourceHover();
    const querying = vi.spyOn(report.inspection!, 'query'), reading = vi.spyOn(report.inspection!, 'read');
    try {
      navigation.published(catalog, 1, report);
      hover.published(catalog, 1, report);
      expect(querying.mock.calls.filter(([kind]) => kind === 'reference')).toHaveLength(1);
      const queries = querying.mock.calls.length, reads = reading.mock.calls.length;
      expect(navigation.definition(catalog.uri, 1, 46)).toEqual({ source: catalog, startOffset: 5, endOffset: 9 });
      expect(hover.hover(catalog.uri, 1, 46)?.signature).toBe('type Book');
      expect(hover.hover(catalog.uri, 1, 5)?.signature).toBe('type Book');
      expect(querying).toHaveBeenCalledTimes(queries);
      expect(reading).toHaveBeenCalledTimes(reads);
    } finally { querying.mockRestore(); reading.mockRestore(); }
  });

  it('withdraws a genuinely bound imported target when its exact source is no longer captured', () => {
    const hover = new SourceHover(), book = { uri: 'file:///workspace/book.expec', text: 'type Book { title: Text }' };
    const entry = { uri: 'file:///workspace/basket.expec', text: 'use Book from "./book.expec"\ntype Basket { book: Book }' };
    const report = reportFor(entry, [book]);
    hover.published(entry, 1, report);
    expect(hover.hover(entry.uri, 1, 49)).toEqual({ source: entry, startOffset: 49, endOffset: 53,
      signature: 'type Book', description: '' });
    hover.published(entry, 1, { ...report, sources: report.sources.filter(source => source.uri !== book.uri) });
    expect(hover.hover(entry.uri, 1, 49)).toBeUndefined();
    hover.published({ ...entry, text: entry.text + '\n' }, 1, report);
    expect(hover.hover(entry.uri, 1, 49)).toBeUndefined();
  });

  it('leaves a real source-free external declaration without fabricated authored documentation', () => {
    const source = { uri: 'file:///workspace/catalog.expec', text: 'use Book from "./external"\ntype Basket { book: Book }' };
    const read = new LangiumReader().read({ sourceId: source.uri, text: source.text });
    if (read.status !== 'accepted') throw new Error('External caller source was rejected.');
    const external = new ExternalModel('file:///workspace/external', [{ kind: 'record-type', name: 'Book', fields: [] }]);
    const resolution = new SourceComposer((owner, authored) => new URL(authored, owner).href)
      .compose(new LangiumModel(source.uri, read.document), { modules: [external], packages: [] });
    const inspection = new QueryInspection(resolution.model);
    expect([...inspection.query('reference')].some(reference => reference.segments[0] === 'Book' &&
      reference.resolution.status === 'bound' && inspection.read(reference.resolution.target).origin.kind === 'external')).toBe(true);
    const hover = new SourceHover();
    hover.published(source, 1, { syntax: [], sources: [source], dependencies: [external.locator], inspection });
    expect(hover.hover(source.uri, 1, 47)).toBeUndefined();
  });

  it('keeps absent-body functions and example helpers as exact authored signatures', () => {
    const source = { uri: 'file:///workspace/helpers.expec', text: 'function lookup() returns Text\nexamples {\n  setup seed() returns Nothing\n  action add(title: Text) returns Nothing\n  observation title() returns Text\n  check expectTitle() { assert true }\n}' };
    const hover = new SourceHover(), report = reportFor(source);
    expect(report.syntax).toEqual([]);
    expect(report.compilation?.problems).toEqual([]);
    hover.published(source, 1, report);
    const signature = (name: string) => hover.hover(source.uri, 1, source.text.indexOf(name))?.signature;
    expect(signature('lookup')).toBe('function lookup() returns Text');
    expect(signature('seed')).toBe('setup seed() returns Nothing');
    expect(signature('add')).toBe('action add(title: Text) returns Nothing');
    expect(signature('title()')).toBe('observation title() returns Text');
    expect(signature('expectTitle')).toBe('check expectTitle()');
    expect(hover.hover(source.uri, 1, source.text.indexOf('expectTitle'))?.description).toBe('');
  });

  it('protects retained answers from caller mutation and closes only the requested lifetime', () => {
    const hover = new SourceHover(), other = { ...catalog, uri: 'file:///workspace/other.expec' };
    hover.published(catalog, 10, reportFor(catalog));
    hover.published(other, 1, reportFor(other));
    const first = hover.hover(catalog.uri, 10, 46)!;
    expect(Object.isFrozen(first.source)).toBe(true);
    first.startOffset = 0; first.signature = 'changed'; first.description = 'changed';
    expect(hover.hover(catalog.uri, 10, 46)?.signature).toBe('type Book');
    expect(hover.hover(catalog.uri, 10, 46)?.startOffset).toBe(46);
    hover.closed(catalog.uri); hover.closed(catalog.uri);
    expect(hover.hover(catalog.uri, 10, 46)).toBeUndefined();
    expect(hover.hover(other.uri, 1, 46)?.signature).toBe('type Book');
    hover.dispose(); hover.dispose();
    hover.published(catalog, 1, reportFor(catalog));
    expect(hover.hover(catalog.uri, 1, 46)).toBeUndefined();
    expect(hover.hover(other.uri, 1, 46)).toBeUndefined();
  });
});
