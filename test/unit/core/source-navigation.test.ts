import { describe, expect, it, vi } from 'vitest';
import { DocumentAnalysis } from '../../../src/core/DocumentAnalysis.js';
import type { DocumentReport } from '../../../src/core/DocumentReport.js';
import type { SourceDocument } from '../../../src/core/SourceDocument.js';
import { SourceNavigation } from '../../../src/core/SourceNavigation.js';

const local = { uri: 'file:///workspace/catalog.expec', text: 'type Book { title: Text }\ntype Basket { book: Book }' };
function reportFor(source: SourceDocument, saved: SourceDocument[] = []): DocumentReport {
  let report: DocumentReport | undefined;
  const sources = new Map(saved.map(source => [source.uri, source]));
  const analysis = new DocumentAnalysis({ publish: (_source, _version, actual) => { report = actual; }, clear: () => {} },
    { read: uri => sources.get(uri) });
  analysis.opened(source, 1);
  if (!report) throw new Error('The real DocumentAnalysis did not publish a report.');
  return report;
}

describe('current source navigation for its plain caller', () => {
  it('rejects invalid versions and cursor offsets without replacing a current answer', () => {
    const navigation = new SourceNavigation();
    const report = reportFor(local);
    navigation.published(local, 0, report);
    for (const invalid of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => navigation.published(local, invalid, { ...report, inspection: undefined })).toThrow(RangeError);
      expect(() => navigation.definition(local.uri, invalid, 46)).toThrow(RangeError);
      expect(() => navigation.definition(local.uri, 0, invalid)).toThrow(RangeError);
    }
    expect(navigation.definition(local.uri, 0, 46)).toEqual({ source: local, startOffset: 5, endOffset: 9 });
  });

  it('selects the final identifier only inside its half-open range', () => {
    const navigation = new SourceNavigation();
    navigation.published(local, 1, reportFor(local));
    expect(navigation.definition(local.uri, 1, 49)).toEqual({ source: local, startOffset: 5, endOffset: 9 });
    expect(navigation.definition(local.uri, 1, 50)).toBeUndefined();
    expect(navigation.definition(local.uri, 1, 5)).toBeUndefined();
    expect(navigation.definition(local.uri, 1, local.text.length)).toBeUndefined();
    expect(navigation.definition(local.uri, 1, local.text.length + 1)).toBeUndefined();
  });

  it('withdraws an actually bound imported target when its text is no longer captured', () => {
    const navigation = new SourceNavigation();
    const book = { uri: 'file:///workspace/book.expec', text: 'type Book { title: Text }' };
    const entry = { uri: 'file:///workspace/basket.expec', text: 'use Book from "./book.expec"\ntype Basket { book: Book }' };
    const report = reportFor(entry, [book]);
    expect(report.inspection).toBeDefined();
    navigation.published(entry, 1, report);
    expect(navigation.definition(entry.uri, 1, 49)).toEqual({ source: book, startOffset: 5, endOffset: 9 });
    navigation.published(entry, 1, { ...report, sources: report.sources.filter(source => source.uri !== book.uri) });
    expect(navigation.definition(entry.uri, 1, 49)).toBeUndefined();
  });

  it('keeps a bound type usable while refusing a real deferred receiver member', () => {
    const navigation = new SourceNavigation();
    const source = { uri: 'file:///workspace/cart.expec', text: 'type Cart {}\nfunction save(cart: Cart) { ensures cart.save() == true }' };
    const report = reportFor(source);
    expect(report.compilation?.problems.map(problem => problem.code)).toEqual(['invalid-member']);
    expect([...report.inspection!.query('reference')].some(reference => reference.resolution.status === 'deferred')).toBe(true);
    navigation.published(source, 1, report);
    expect(navigation.definition(source.uri, 1, 33)).toEqual({ source, startOffset: 5, endOffset: 9 });
    expect(navigation.definition(source.uri, 1, 54)).toBeUndefined();
  });

  it('forgets only the closed URI and ignores all publications after disposal', () => {
    const navigation = new SourceNavigation();
    const other = { ...local, uri: 'file:///workspace/other.expec' };
    navigation.published(local, 10, reportFor(local));
    navigation.published(other, 1, reportFor(other));
    navigation.closed(local.uri); navigation.closed(local.uri);
    expect(navigation.definition(local.uri, 10, 46)).toBeUndefined();
    expect(navigation.definition(other.uri, 1, 46)).toEqual({ source: other, startOffset: 5, endOffset: 9 });
    navigation.dispose(); navigation.dispose();
    navigation.published(local, 1, reportFor(local));
    expect(navigation.definition(local.uri, 1, 46)).toBeUndefined();
    expect(navigation.definition(other.uri, 1, 46)).toBeUndefined();
  });

  it('reuses prepared SDK facts and protects the next reply from caller mutation', () => {
    const navigation = new SourceNavigation();
    const report = reportFor(local);
    navigation.published(local, 1, report);
    const querying = vi.spyOn(report.inspection!, 'query');
    const reading = vi.spyOn(report.inspection!, 'read');
    try {
      const first = navigation.definition(local.uri, 1, 46)!;
      expect(Object.isFrozen(first.source)).toBe(true);
      first.startOffset = 0; first.endOffset = 0;
      expect(navigation.definition(local.uri, 1, 47)).toEqual({ source: local, startOffset: 5, endOffset: 9 });
      expect(querying).not.toHaveBeenCalled();
      expect(reading).not.toHaveBeenCalled();
    } finally { querying.mockRestore(); reading.mockRestore(); }
  });
});