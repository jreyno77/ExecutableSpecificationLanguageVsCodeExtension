import { describe, expect, it, vi } from 'vitest';
import { LangiumReader, type SyntaxDiagnostic } from 'executable-specification-language';
import { DocumentAnalysis } from '../../../src/core/DocumentAnalysis.js';
import type { SourceDocument } from '../../../src/core/SourceDocument.js';

type Publication = { source: SourceDocument; version: number; problems: SyntaxDiagnostic[] };
function recordedAnalysis() {
  const publications: Publication[] = [], clears: string[] = [];
  const analysis = new DocumentAnalysis({
    publish: (source, version, problems) => { publications.push({ source, version, problems }); },
    clear: uri => { clears.push(uri); },
  });
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
      publish: (source, version, problems) => { publications.push({ source, version, problems }); throw failure; },
      clear: () => {},
    });
    let thrown: unknown;
    try { analysis.opened({ uri: 'untitled:Draft', text: 'type Draft {}' }, 1); } catch (error) { thrown = error; }
    expect(thrown).toBe(failure);
    expect(publications).toEqual([{ source: { uri: 'untitled:Draft', text: 'type Draft {}' }, version: 1, problems: [] }]);
  });
});
