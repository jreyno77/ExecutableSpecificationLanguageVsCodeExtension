import type { DocumentReport } from '../../../src/core/DocumentReport.js';
import { describe, expect, it, vi } from 'vitest';
import { LangiumReader, type SyntaxDiagnostic } from 'executable-specification-language';
import { DocumentAnalysis } from '../../../src/core/DocumentAnalysis.js';
import type { SourceDocument } from '../../../src/core/SourceDocument.js';

type Publication = { source: SourceDocument; version: number; problems: SyntaxDiagnostic[] };
function recordedAnalysis() {
  const publications: Publication[] = [], clears: string[] = [];
  const analysis = new DocumentAnalysis({
    publish: (source, version, report) => { publications.push({ source, version, problems: report.syntax }); },
    clear: uri => { clears.push(uri); },
  }, { read: () => undefined });
  return { analysis, publications, clears };
}

describe('current document feedback at the reader and publication boundaries', () => {
  it('publishes only the reopened lifetime when reading reenters the same URI', () => {
    const { analysis, publications, clears } = recordedAnalysis();
    const uri = 'untitled:Draft';
    const read = LangiumReader.prototype.read;
    const reading = vi.spyOn(LangiumReader.prototype, 'read').mockImplementationOnce(function (this: LangiumReader, source) {
      const result = read.call(this, source);
      analysis.closed(uri);
      analysis.opened({ uri, text: 'type Draft {}' }, 1);
      return result;
    });
    try {
      analysis.opened({ uri, text: 'type Draft {' }, 10);
      expect(clears).toEqual(['untitled:Draft']);
      expect(publications).toEqual([{ source: { uri: 'untitled:Draft', text: 'type Draft {}' }, version: 1, problems: [] }]);
    } finally { reading.mockRestore(); }
  });

  it('keeps an earlier published snapshot unchanged when its caller changes the input object', () => {
    const { analysis, publications } = recordedAnalysis();
    const source = { uri: 'file:///workspace/book.expec', text: 'type Book {}' };
    analysis.opened(source, 1);
    source.uri = 'untitled:Changed';
    source.text = 'type Book {';
    expect(publications).toEqual([{ source: { uri: 'file:///workspace/book.expec', text: 'type Book {}' }, version: 1, problems: [] }]);
    expect(Object.isFrozen(publications[0]!.source)).toBe(true);
  });

  it('surfaces the exact reader failure without publishing an empty successful result', () => {
    const { analysis, publications } = recordedAnalysis();
    const failure = new Error('Reader failed after receiving the document');
    const read = LangiumReader.prototype.read;
    const reading = vi.spyOn(LangiumReader.prototype, 'read').mockImplementationOnce(function (this: LangiumReader, source) {
      read.call(this, source);
      throw failure;
    });
    let thrown: unknown;
    try {
      try { analysis.opened({ uri: 'untitled:Draft', text: 'type Draft {}' }, 1); } catch (error) { thrown = error; }
      expect(thrown).toBe(failure);
      expect(publications).toEqual([]);
    } finally { reading.mockRestore(); }
  });

  it('surfaces the exact publication failure after checking the actual document', () => {
    const publications: Publication[] = [];
    const failure = new Error('Feedback consumer failed');
    const analysis = new DocumentAnalysis({
      publish: (source, version, report) => { publications.push({ source, version, problems: report.syntax }); throw failure; },
      clear: () => {},
    }, { read: () => undefined });
    let thrown: unknown;
    try { analysis.opened({ uri: 'untitled:Draft', text: 'type Draft {}' }, 1); } catch (error) { thrown = error; }
    expect(thrown).toBe(failure);
    expect(publications).toEqual([{ source: { uri: 'untitled:Draft', text: 'type Draft {}' }, version: 1, problems: [] }]);
  });
});


describe('semantic source capture and current feedback', () => {
  it('rereads and reparses only the changed required source', () => {
    const first = { uri: 'file:///workspace/first.expec', text: 'type First { value: Text }' };
    const second = { uri: 'file:///workspace/second.expec', text: 'type Second { value: Text }' };
    const saved = new Map([[first.uri, first], [second.uri, second]]);
    const reads: string[] = [], reports: DocumentReport[] = [];
    const analysis = new DocumentAnalysis({ publish: (_source, _version, report) => { reports.push(report); }, clear: () => {} }, {
      read: uri => { reads.push(uri); return saved.get(uri); },
    });
    const reading = vi.spyOn(LangiumReader.prototype, 'read');
    try {
      analysis.opened({ uri: 'file:///workspace/entry.expec', text: 'use First from "./first.expec"\nuse Second from "./second.expec"\ntype Entry { first: First\n second: Second }' }, 1);
      saved.set(first.uri, { uri: first.uri, text: 'type First { name: Text }' });
      analysis.sourceChanged(first.uri);
      expect(reports.at(-1)?.compilation?.value).toBeDefined();
      expect(reads).toEqual(['file:///workspace/first.expec', 'file:///workspace/second.expec', 'file:///workspace/first.expec']);
      expect(reading).toHaveBeenCalledTimes(4);
    } finally { reading.mockRestore(); }
  });

  it('preserves invalid imported syntax at its own source and leaves earlier reports unchanged', () => {
    const uri = 'file:///workspace/book.expec';
    let saved = { uri, text: 'type Book { title: Text }' };
    const reports: DocumentReport[] = [];
    const analysis = new DocumentAnalysis({ publish: (_source, _version, report) => { reports.push(report); }, clear: () => {} }, { read: () => saved });
    analysis.opened({ uri: 'file:///workspace/basket.expec', text: 'use Book from "./book.expec"\ntype Basket { book: Book }' }, 1);
    saved = { uri, text: 'type Book {' };
    analysis.sourceChanged(uri);
    expect(reports[0]!.compilation?.value).toBeDefined();
    expect(reports[0]!.sources.find(source => source.uri === uri)?.text).toBe('type Book { title: Text }');
    expect(reports[1]!.compilation?.value).toBeUndefined();
    expect(reports[1]!.compilation?.problems[0]?.code).toBe('unavailable-module');
    expect(reports[1]!.syntax[0]?.primaryRange.sourceId).toBe('file:///workspace/book.expec');
    expect(reports[1]!.sources.find(source => source.uri === uri)?.text).toBe('type Book {');
  });

  it('rejects a source provider that returns another URI without publishing false feedback', () => {
    const reports: DocumentReport[] = [];
    const analysis = new DocumentAnalysis({ publish: (_source, _version, report) => { reports.push(report); }, clear: () => {} }, {
      read: () => ({ uri: 'file:///other/book.expec', text: 'type Book {}' }),
    });
    expect(() => analysis.opened({ uri: 'file:///workspace/basket.expec', text: 'use Book from "./book.expec"\ntype Basket { book: Book }' }, 1)).toThrow(TypeError);
    expect(reports).toEqual([]);
  });

  it('does not publish older captured text when acquisition reenters with a dependency change', () => {
    const uri = 'file:///workspace/book.expec';
    const old = { uri, text: 'type Book { title: Text }' };
    const latest = { uri, text: 'type Magazine { title: Text }' };
    const reports: DocumentReport[] = [];
    let firstRead = true;
    const analysis = new DocumentAnalysis({ publish: (_source, _version, report) => { reports.push(report); }, clear: () => {} }, {
      read: () => {
        if (firstRead) { firstRead = false; analysis.sourceChanged(uri); return old; }
        return latest;
      },
    });
    analysis.opened({ uri: 'file:///workspace/basket.expec', text: 'use Book from "./book.expec"\ntype Basket { book: Book }' }, 1);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.compilation?.value).toBeUndefined();
    expect(reports[0]!.compilation?.problems[0]?.code).toBe('unresolved-reference');
    expect(reports[0]!.sources.find(source => source.uri === uri)?.text).toBe('type Magazine { title: Text }');
  });
});


it('releases a closed source capture before a later independent open lifetime', () => {
  let latest: DocumentReport | undefined;
  const analysis = new DocumentAnalysis({ publish: (_source, _version, report) => { latest = report; }, clear: () => {} }, { read: () => undefined });
  const source = { uri: 'untitled:Draft', text: 'type Draft {}' };
  const reading = vi.spyOn(LangiumReader.prototype, 'read');
  try {
    analysis.opened(source, 1);
    analysis.closed(source.uri);
    analysis.opened(source, 1);
    expect(latest?.compilation?.value).toBeDefined();
    expect(reading).toHaveBeenCalledTimes(2);
  } finally { reading.mockRestore(); }
});
