import type { Inspection, Item } from 'executable-specification-language';
import { describe, expect, it } from 'vitest';
import { DocumentAnalysis } from '../../../src/core/DocumentAnalysis.js';
import { DocumentOutline } from '../../../src/core/DocumentOutline.js';
import type { DocumentReport } from '../../../src/core/DocumentReport.js';
import type { SourceDocument } from '../../../src/core/SourceDocument.js';

const book = { uri: 'file:///workspace/book.expec', text: 'type Book { title: Text }' };
function reportFor(source: SourceDocument): DocumentReport {
  let report: DocumentReport | undefined;
  const analysis = new DocumentAnalysis({ publish: (_source, _version, actual) => { report = actual; }, clear: () => {} },
    { read: () => undefined });
  analysis.opened(source, 1);
  if (!report) throw new Error('The real analysis did not publish an outline input.');
  return report;
}

/** A caller supplies one invalid metadata item while all other SDK facts remain real. */
function alteredRecord(report: DocumentReport, name: string,
  alter: (record: Item<'record-type-declaration'>) => Item<'record-type-declaration'>): DocumentReport {
  const original = report.inspection;
  if (!original) throw new Error('The actual report has no Inspection.');
  const selected = [...original.query('record-type-declaration')].find(record => record.name === name);
  if (!selected) throw new Error('The actual report has no record named ' + name);
  const changed = alter(selected);
  const items = (input: Iterable<Item>): Item[] => [...input].map(item => item.id === selected.id ? changed : item);
  const inspection: Inspection = {
    roots: () => items(original.roots()), children: id => items(original.children(id)),
    parent: original.parent.bind(original), query: original.query.bind(original), read: original.read.bind(original),
  };
  return { ...report, inspection };
}

describe('document outline for its plain caller', () => {
  it('rejects invalid versions before replacing a current tree', () => {
    const outline = new DocumentOutline(), report = reportFor(book);
    outline.published(book, 0, report);
    for (const invalid of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => outline.published(book, invalid, { ...report, inspection: undefined })).toThrow(RangeError);
      expect(() => outline.symbols(book.uri, invalid)).toThrow(RangeError);
    }
    expect(outline.symbols(book.uri, 0)?.symbols[0].name).toBe('Book');
    expect(outline.symbols(book.uri, 0)?.symbols[0].children[0].name).toBe('title');
  });

  it('withdraws a tree when its exact captured text is unavailable even at the same version', () => {
    const outline = new DocumentOutline(), report = reportFor(book);
    outline.published(book, 1, report);
    expect(outline.symbols(book.uri, 1)?.source.text).toBe('type Book { title: Text }');
    outline.published(book, 1, { ...report, sources: [] });
    expect(outline.symbols(book.uri, 1)).toBeUndefined();
    outline.published(book, 1, report);
    expect(outline.symbols(book.uri, 1)?.symbols[0].name).toBe('Book');
    outline.published({ ...book, text: 'type Magazine { title: Text }' }, 1, report);
    expect(outline.symbols(book.uri, 1)).toBeUndefined();
  });

  it('keeps the entry tree when an imported syntax rejection produces a replacement report', () => {
    const entry = { uri: 'file:///workspace/basket.expec', text: 'use Book from "./book.expec"\ntype Basket { book: Book }' };
    const saved = new Map([[book.uri, book]]), outline = new DocumentOutline();
    const reports: DocumentReport[] = [];
    const analysis = new DocumentAnalysis({ publish: (source, version, report) => {
      reports.push(report); outline.published(source, version, report);
    }, clear: uri => outline.closed(uri) }, { read: uri => saved.get(uri) });
    analysis.opened(entry, 1);
    expect(outline.symbols(entry.uri, 1)?.symbols[0].name).toBe('Basket');
    saved.set(book.uri, { ...book, text: 'type Book {' });
    analysis.sourceChanged(book.uri);
    expect(reports).toHaveLength(2);
    expect(reports[1].syntax.length).toBeGreaterThan(0);
    expect(reports[1].inspection).toBeDefined();
    expect(outline.symbols(entry.uri, 1)?.source).toEqual(entry);
    expect(outline.symbols(entry.uri, 1)?.symbols).toHaveLength(1);
    expect(outline.symbols(entry.uri, 1)?.symbols[0].children[0].name).toBe('book');
  });

  it('omits an invalid name selection and its descendants while retaining a valid sibling', () => {
    const source = { uri: book.uri, text: 'type Book { title: Text }\ntype Magazine {}' };
    const report = reportFor(source), outline = new DocumentOutline();
    const invalid = alteredRecord(report, 'Book', record => {
      if (record.nameOrigin.kind !== 'source') throw new Error('Actual record name has no source origin.');
      return { ...record, nameOrigin: { ...record.nameOrigin,
        range: { ...record.nameOrigin.range, start: { ...record.nameOrigin.range.start, offset: -1 } } } };
    });
    outline.published(source, 1, invalid);
    expect(outline.symbols(source.uri, 1)?.symbols).toHaveLength(1);
    expect(outline.symbols(source.uri, 1)?.symbols[0]).toMatchObject({ name: 'Magazine', kind: 'record-type-declaration', children: [] });
  });

  it('does not promote a nested declaration outside its actual parent range', () => {
    const source = { uri: 'file:///workspace/library.expec',
      text: 'component Library {\n  local type Book { title: Text }\n}\ntype Magazine {}' };
    const report = reportFor(source), outline = new DocumentOutline();
    const invalid = alteredRecord(report, 'Book', record => {
      if (record.origin.kind !== 'source') throw new Error('Actual record has no source origin.');
      return { ...record, origin: { ...record.origin,
        range: { ...record.origin.range, end: { ...record.origin.range.end, offset: Array.from(source.text).length } } } };
    });
    outline.published(source, 1, invalid);
    expect(outline.symbols(source.uri, 1)?.symbols.map(symbol => symbol.name)).toEqual(['Library', 'Magazine']);
    expect(outline.symbols(source.uri, 1)?.symbols[0].children).toEqual([]);
  });

  it('retains exact whitespace names as language facts and ends only the closed lifetime', () => {
    const quoted = { uri: 'file:///workspace/quoted.expec', text: 'type `   ` {}' };
    const outline = new DocumentOutline();
    outline.published(book, 10, reportFor(book));
    outline.published(quoted, 1, reportFor(quoted));
    expect(outline.symbols(quoted.uri, 1)?.symbols[0].name).toBe('   ');
    outline.closed(book.uri); outline.closed(book.uri);
    expect(outline.symbols(book.uri, 10)).toBeUndefined();
    expect(outline.symbols(quoted.uri, 1)?.symbols[0].name).toBe('   ');
    outline.published(book, 1, reportFor(book));
    expect(outline.symbols(book.uri, 1)?.symbols[0].name).toBe('Book');
    outline.dispose(); outline.dispose();
    outline.published(book, 2, reportFor(book));
    expect(outline.symbols(book.uri, 2)).toBeUndefined();
    expect(outline.symbols(quoted.uri, 1)).toBeUndefined();
  });
});
